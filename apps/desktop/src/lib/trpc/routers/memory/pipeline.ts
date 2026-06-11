import {
	memoryEpisodes,
	memoryPolicies,
	memorySkills,
	memoryTraces,
	memoryWorldModels,
} from "@superset/local-db";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getConfiguredAiCliAgent, runAiCliWithTempCwd } from "../utils/ai-cli";
import { computeEmbedding } from "./embedding";
import { syncCognitiveMemoryToFiles } from "./sync";

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function callLlm(
	prompt: string,
	timeoutMs = 30000,
): Promise<string | null> {
	const result = await runAiCliWithTempCwd(prompt, {
		agent: getConfiguredAiCliAgent(),
		timeoutMs,
	});

	if (!result.ok) {
		console.error("[pipeline] LLM CLI failed:", result.reason);
		return null;
	}

	return result.text;
}

function parseJsonFromLlm<T>(text: string | null): T | null {
	if (!text) return null;
	const match = text.match(/[[{][\s\S]*[\]}]/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]) as T;
	} catch {
		return null;
	}
}

function formatTraceSummary(
	traces: Array<{
		userText: string | null;
		agentText: string | null;
		toolCalls: unknown;
		errorSignatures: unknown;
	}>,
	maxCharsPerField = 300,
): string {
	return traces
		.map((t, i) => {
			const parts = [`Step ${i + 1}:`];
			if (t.userText)
				parts.push(`  User: ${t.userText.slice(0, maxCharsPerField)}`);
			if (t.agentText)
				parts.push(`  Agent: ${t.agentText.slice(0, maxCharsPerField)}`);
			if (t.toolCalls) {
				const calls = t.toolCalls as Array<{
					tool: string;
					input: string;
					output: string;
				}>;
				parts.push(`  Tools: ${calls.map((c) => c.tool).join(", ")}`);
				for (const c of calls) {
					if (c.output) parts.push(`  Result: ${c.output.slice(0, 200)}`);
				}
			}
			if (t.errorSignatures) {
				const sigs = t.errorSignatures as string[];
				if (sigs.length > 0) parts.push(`  Errors: ${sigs.join("; ")}`);
			}
			return parts.join("\n");
		})
		.join("\n\n");
}

// ---------------------------------------------------------------------------
// Pipeline Step 1: Score Episode (R_human via LLM three-axis rubric)
// ---------------------------------------------------------------------------

async function scoreEpisode(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) return;

	const traces = localDb
		.select()
		.from(memoryTraces)
		.where(eq(memoryTraces.episodeId, episodeId))
		.orderBy(memoryTraces.turnIndex)
		.all();
	if (traces.length === 0) return;

	const traceSummary = formatTraceSummary(traces, 200);

	const result = await callLlm(
		`Score this coding agent session on three axes. Each score is a float between -1.0 and 1.0.

Title: ${episode.title}

Interaction (${traces.length} steps):
${traceSummary.slice(0, 6000)}

Return a JSON object:
- "goal_achievement": float (-1 to 1) — did the agent accomplish the user's goal?
- "process_quality": float (-1 to 1) — was the process efficient, or wasteful with unnecessary steps?
- "user_satisfaction": float (-1 to 1) — would the user be satisfied with this interaction?

Return ONLY the JSON object, no explanation.`,
	);

	const scores = parseJsonFromLlm<{
		goal_achievement: number;
		process_quality: number;
		user_satisfaction: number;
	}>(result);

	if (!scores) {
		console.log("[pipeline] scoreEpisode: LLM returned no valid scores");
		return;
	}

	const clamp = (v: number) => Math.max(-1, Math.min(1, v));
	const rHumanRaw =
		0.45 * clamp(scores.goal_achievement) +
		0.3 * clamp(scores.process_quality) +
		0.25 * clamp(scores.user_satisfaction);

	const rHuman = (rHumanRaw + 1) / 2;

	localDb
		.update(memoryEpisodes)
		.set({
			rHuman,
			rGoalAchievement: clamp(scores.goal_achievement),
			rProcessQuality: clamp(scores.process_quality),
			rUserSatisfaction: clamp(scores.user_satisfaction),
			updatedAt: Date.now(),
		})
		.where(eq(memoryEpisodes.id, episodeId))
		.run();

	console.log("[pipeline] scoreEpisode:", {
		episodeId,
		rHuman: rHuman.toFixed(3),
		goal: scores.goal_achievement,
		process: scores.process_quality,
		satisfaction: scores.user_satisfaction,
	});
}

// ---------------------------------------------------------------------------
// Pipeline Step 2: Score Alpha (reflection weight per trace via LLM)
// ---------------------------------------------------------------------------

async function scoreAlphas(episodeId: string) {
	const traces = localDb
		.select()
		.from(memoryTraces)
		.where(eq(memoryTraces.episodeId, episodeId))
		.orderBy(memoryTraces.turnIndex)
		.all();
	if (traces.length === 0) return;

	const traceSummary = traces
		.map((t, i) => {
			const parts = [`Step ${i + 1}:`];
			if (t.userText) parts.push(`  User: ${t.userText.slice(0, 150)}`);
			if (t.agentText) parts.push(`  Agent: ${t.agentText.slice(0, 150)}`);
			if (t.toolCalls) {
				const calls = t.toolCalls as Array<{ tool: string }>;
				parts.push(`  Tools: ${calls.map((c) => c.tool).join(", ")}`);
			}
			return parts.join("\n");
		})
		.join("\n");

	const result = await callLlm(
		`For each step in this agent session, assign a "reflection weight" (alpha) between 0.0 and 1.0.

Alpha measures how much this step contributed a KEY INSIGHT vs was just blind trial-and-error:
- 1.0 = critical decision point, key insight, turning point that changed the outcome
- 0.7 = important step with clear reasoning
- 0.5 = standard execution, neither insightful nor wasteful
- 0.3 = exploration/trial step
- 0.0 = blind repetition, wasted effort, tautological action

Session (${traces.length} steps):
${traceSummary.slice(0, 5000)}

Return a JSON array of numbers (one alpha per step, in order). Length must be exactly ${traces.length}.
Return ONLY the JSON array.`,
	);

	const alphas = parseJsonFromLlm<number[]>(result);
	if (!alphas || alphas.length !== traces.length) {
		for (const trace of traces) {
			localDb
				.update(memoryTraces)
				.set({ alpha: 0.5 })
				.where(eq(memoryTraces.id, trace.id))
				.run();
		}
		return;
	}

	for (let i = 0; i < traces.length; i++) {
		const alpha = Math.max(0, Math.min(1, alphas[i] ?? 0.5));
		localDb
			.update(memoryTraces)
			.set({ alpha })
			.where(eq(memoryTraces.id, traces[i].id))
			.run();
	}
}

// ---------------------------------------------------------------------------
// Pipeline Step 3: Backpropagate Reward (V_t computation)
// ---------------------------------------------------------------------------

function backpropReward(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode?.rHuman) return;

	const traces = localDb
		.select()
		.from(memoryTraces)
		.where(eq(memoryTraces.episodeId, episodeId))
		.orderBy(memoryTraces.turnIndex)
		.all();
	if (traces.length === 0) return;

	const R = episode.rHuman;
	const gamma = 0.95;
	const halfLifeDays = 30;

	const values = new Array<number>(traces.length);
	values[traces.length - 1] = R;

	for (let t = traces.length - 2; t >= 0; t--) {
		const alpha = traces[t].alpha ?? 0.5;
		values[t] = alpha * R + (1 - alpha) * gamma * values[t + 1];
	}

	const now = Date.now();
	for (let i = 0; i < traces.length; i++) {
		const trace = traces[i];
		const v = values[i];
		const ageDays = (now - trace.createdAt) / (1000 * 60 * 60 * 24);
		const priority = Math.max(v, 0) * 0.5 ** (ageDays / halfLifeDays);

		localDb
			.update(memoryTraces)
			.set({ value: v, priority })
			.where(eq(memoryTraces.id, trace.id))
			.run();
	}

	console.log("[pipeline] backpropReward:", {
		episodeId,
		R,
		traceValues: values.map((v) => v.toFixed(3)),
	});
}

// ---------------------------------------------------------------------------
// Pipeline Step 4: Induce Policies (L1 traces → L2 candidate policies)
// ---------------------------------------------------------------------------

const VALID_EXPERIENCE_TYPES = new Set([
	"success_pattern",
	"failure_avoidance",
	"preference",
	"workflow",
	"style",
]);

async function inducePolicies(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) return;

	const traces = localDb
		.select()
		.from(memoryTraces)
		.where(eq(memoryTraces.episodeId, episodeId))
		.orderBy(memoryTraces.turnIndex)
		.all();

	const highValueTraces = traces.filter(
		(t) => t.value !== null && t.value > 0.3,
	);
	if (highValueTraces.length === 0) {
		console.log("[pipeline] inducePolicies: no high-value traces");
		return;
	}

	const existingPolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			and(
				eq(memoryPolicies.status, "active"),
				episode.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, episode.projectId),
						)
					: eq(memoryPolicies.scope, "global"),
			),
		)
		.orderBy(desc(memoryPolicies.support))
		.limit(20)
		.all();

	const traceSummary = highValueTraces
		.map((t) => {
			const parts = [];
			if (t.userText) parts.push(`User: ${t.userText.slice(0, 300)}`);
			if (t.agentText) parts.push(`Agent: ${t.agentText.slice(0, 300)}`);
			if (t.toolCalls) {
				const calls = t.toolCalls as Array<{ tool: string }>;
				parts.push(`Tools: ${calls.map((c) => c.tool).join(", ")}`);
			}
			parts.push(`Value: ${t.value?.toFixed(2)}`);
			return parts.join("\n");
		})
		.join("\n---\n");

	const existingPolicySummary =
		existingPolicies.length > 0
			? `\nExisting policies (avoid duplicates, but you may reference them by index if a trace REINFORCES one):\n${existingPolicies.map((p, i) => `[${i}] WHEN ${p.trigger} THEN ${p.procedure}`).join("\n")}\n`
			: "";

	const result = await callLlm(
		`Extract reusable policies from these high-value interaction traces of a coding agent session.

Episode: ${episode.title}
${existingPolicySummary}
High-value traces:
${traceSummary.slice(0, 5000)}

Return a JSON object with two keys:
1. "new_policies": array of NEW policies not covered by existing ones. Each:
   - "trigger": "When [condition]..."
   - "procedure": "Do [action]..."
   - "verification": "Check [condition]..." or null
   - "boundary": "Never [action]..." or null
   - "experienceType": "success_pattern" | "failure_avoidance" | "preference" | "workflow" | "style"
   - "category": grouping label (e.g. "Coding Preferences", "Git Workflow", "Testing")
   - "scope": "global" | "project"

2. "reinforced": array of indices (integers) of existing policies that these traces reinforce/support.

Return ONLY the JSON object. Return {"new_policies":[],"reinforced":[]} if nothing extractable.`,
	);

	const parsed = parseJsonFromLlm<{
		new_policies?: Array<{
			trigger: string;
			procedure: string;
			verification?: string | null;
			boundary?: string | null;
			experienceType?: string;
			category?: string;
			scope?: string;
		}>;
		reinforced?: number[];
	}>(result);

	if (!parsed) return;

	const newPolicies = parsed.new_policies ?? [];
	const reinforced = parsed.reinforced ?? [];

	for (const p of newPolicies) {
		if (!p.trigger || !p.procedure) continue;

		localDb
			.insert(memoryPolicies)
			.values({
				projectId: episode.projectId,
				trigger: p.trigger,
				procedure: p.procedure,
				verification: p.verification ?? null,
				boundary: p.boundary ?? null,
				experienceType: VALID_EXPERIENCE_TYPES.has(p.experienceType ?? "")
					? (p.experienceType as "success_pattern")
					: "preference",
				status: "candidate",
				scope: p.scope === "project" ? "project" : "global",
				category: p.category ?? null,
				sourceEpisodeIds: [episodeId],
				sourceTraceIds: highValueTraces.map((t) => t.id),
			})
			.run();
	}

	for (const idx of reinforced) {
		if (idx >= 0 && idx < existingPolicies.length) {
			const policy = existingPolicies[idx];
			const currentEpisodeIds =
				(policy.sourceEpisodeIds as string[] | null) ?? [];
			localDb
				.update(memoryPolicies)
				.set({
					support: policy.support + 1,
					sourceEpisodeIds: [...currentEpisodeIds, episodeId],
					updatedAt: Date.now(),
				})
				.where(eq(memoryPolicies.id, policy.id))
				.run();
		}
	}

	console.log("[pipeline] inducePolicies:", {
		newPolicies: newPolicies.length,
		reinforced: reinforced.length,
	});
}

// ---------------------------------------------------------------------------
// Pipeline Step 4b: Promote candidate policies with enough support
// ---------------------------------------------------------------------------

function promotePolicies() {
	const SUPPORT_THRESHOLD = 3;

	const promoted = localDb
		.update(memoryPolicies)
		.set({ status: "active", updatedAt: Date.now() })
		.where(
			and(
				eq(memoryPolicies.status, "candidate"),
				gte(memoryPolicies.support, SUPPORT_THRESHOLD),
			),
		)
		.returning()
		.all();

	if (promoted.length > 0) {
		console.log(
			"[pipeline] promotePolicies: promoted",
			promoted.length,
			"policies to active",
		);
	}
}

// ---------------------------------------------------------------------------
// Pipeline Step 5: Abstract World Models (L2 → L3)
// ---------------------------------------------------------------------------

const WORLD_MODEL_MIN_POLICIES = 3;

async function abstractWorldModels(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) return;

	const activePolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			and(
				eq(memoryPolicies.status, "active"),
				episode.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, episode.projectId),
						)
					: eq(memoryPolicies.scope, "global"),
				gte(memoryPolicies.support, 2),
			),
		)
		.orderBy(desc(memoryPolicies.support))
		.all();

	if (activePolicies.length < WORLD_MODEL_MIN_POLICIES) {
		console.log(
			"[pipeline] abstractWorldModels: not enough active policies (",
			activePolicies.length,
			"<",
			WORLD_MODEL_MIN_POLICIES,
			")",
		);
		return;
	}

	const existingModels = localDb
		.select()
		.from(memoryWorldModels)
		.where(
			and(
				eq(memoryWorldModels.status, "active"),
				episode.projectId
					? or(
							eq(memoryWorldModels.scope, "global"),
							eq(memoryWorldModels.projectId, episode.projectId),
						)
					: eq(memoryWorldModels.scope, "global"),
			),
		)
		.all();

	const policySummary = activePolicies
		.map(
			(p) =>
				`[support=${p.support}] WHEN ${p.trigger} THEN ${p.procedure}${p.boundary ? ` NEVER ${p.boundary}` : ""}`,
		)
		.join("\n");

	const existingModelsSummary =
		existingModels.length > 0
			? `\nExisting world models (update or skip if already covered):\n${existingModels.map((m) => `[${m.modelType}] ${m.content}`).join("\n")}\n`
			: "";

	const result = await callLlm(
		`From these validated coding agent policies, extract stable environmental knowledge.

Active policies:
${policySummary.slice(0, 4000)}
${existingModelsSummary}

Extract knowledge that is STABLE (unlikely to change) and ENVIRONMENTAL (about the project/tools, not about user preferences). Categorize each into one of three types:

1. "environment" — factual topology: project structure, tech stack, file locations, tool versions
2. "inference" — behavioral rules: how the system behaves, cause-effect patterns
3. "constraint" — taboos/prohibitions: things that must never be done, hard limits

Return a JSON array. Each entry:
- "modelType": "environment" | "inference" | "constraint"
- "content": string — the knowledge statement (clear, declarative)
- "confidence": float (0.0 to 1.0) — how certain is this?
- "scope": "global" | "project"
- "domainTags": string[] — topic tags

Return [] if no stable environmental knowledge can be extracted. Do NOT repeat existing models.
Return ONLY the JSON array.`,
	);

	const models =
		parseJsonFromLlm<
			Array<{
				modelType: string;
				content: string;
				confidence?: number;
				scope?: string;
				domainTags?: string[];
			}>
		>(result);

	if (!models || models.length === 0) return;

	const validTypes = new Set(["environment", "inference", "constraint"]);
	let created = 0;

	for (const m of models) {
		if (!m.content || !validTypes.has(m.modelType)) continue;

		localDb
			.insert(memoryWorldModels)
			.values({
				projectId: episode.projectId,
				modelType: m.modelType as "environment",
				content: m.content,
				confidence: Math.max(0, Math.min(1, m.confidence ?? 0.5)),
				scope: m.scope === "project" ? "project" : "global",
				domainTags: m.domainTags ?? null,
				sourcePolicyIds: activePolicies.map((p) => p.id),
			})
			.run();
		created++;
	}

	console.log("[pipeline] abstractWorldModels: created", created, "models");
}

// ---------------------------------------------------------------------------
// Pipeline Step 6: Crystallize Skills (L2+L3 → Skills)
// ---------------------------------------------------------------------------

const SKILL_MIN_SUPPORT = 5;
const SKILL_MIN_GAIN = 0.6;

async function crystallizeSkills(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) return;

	const eligiblePolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			and(
				eq(memoryPolicies.status, "active"),
				gte(memoryPolicies.support, SKILL_MIN_SUPPORT),
				gte(memoryPolicies.gain, SKILL_MIN_GAIN),
				episode.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, episode.projectId),
						)
					: eq(memoryPolicies.scope, "global"),
			),
		)
		.orderBy(desc(memoryPolicies.gain))
		.all();

	if (eligiblePolicies.length === 0) {
		console.log("[pipeline] crystallizeSkills: no eligible policies");
		return;
	}

	const existingSkills = localDb
		.select()
		.from(memorySkills)
		.where(
			episode.projectId
				? or(
						eq(memorySkills.scope, "global"),
						eq(memorySkills.projectId, episode.projectId),
					)
				: eq(memorySkills.scope, "global"),
		)
		.all();

	const existingSkillNames = new Set(
		existingSkills.map((s) => s.name.toLowerCase()),
	);

	const policySummary = eligiblePolicies
		.map(
			(p) =>
				`[support=${p.support}, gain=${p.gain?.toFixed(2)}] WHEN ${p.trigger} THEN ${p.procedure}`,
		)
		.join("\n");

	const existingSkillsSummary =
		existingSkills.length > 0
			? `\nExisting skills (do NOT duplicate):\n${existingSkills.map((s) => `- ${s.name}: ${s.invocationGuide}`).join("\n")}\n`
			: "";

	const worldModels = localDb
		.select()
		.from(memoryWorldModels)
		.where(
			and(
				eq(memoryWorldModels.status, "active"),
				episode.projectId
					? or(
							eq(memoryWorldModels.scope, "global"),
							eq(memoryWorldModels.projectId, episode.projectId),
						)
					: eq(memoryWorldModels.scope, "global"),
			),
		)
		.limit(10)
		.all();

	const worldModelContext =
		worldModels.length > 0
			? `\nEnvironment context:\n${worldModels.map((m) => `[${m.modelType}] ${m.content}`).join("\n")}\n`
			: "";

	const result = await callLlm(
		`From these well-validated policies and environmental context, crystallize callable skills.

A skill is a MATURE, REUSABLE capability that an agent can invoke as a complete procedure.
Only crystallize when multiple policies converge on a clear, repeatable workflow.

Eligible policies:
${policySummary.slice(0, 3000)}
${worldModelContext}${existingSkillsSummary}

Return a JSON array. Each skill:
- "name": short descriptive name (2-5 words)
- "invocationGuide": when to use this skill (1-2 sentences)
- "procedure": array of steps, each: {"step": number, "action": string, "detail": string}
- "scope": "global" | "project"
- "sourcePolicyIds": array of indices into the policy list above

Return [] if no skills can be crystallized yet. Quality over quantity.
Return ONLY the JSON array.`,
	);

	const skills =
		parseJsonFromLlm<
			Array<{
				name: string;
				invocationGuide: string;
				procedure?: Array<{ step: number; action: string; detail: string }>;
				scope?: string;
				sourcePolicyIds?: number[];
			}>
		>(result);

	if (!skills || skills.length === 0) return;

	let created = 0;

	for (const s of skills) {
		if (!s.name || !s.invocationGuide) continue;
		if (existingSkillNames.has(s.name.toLowerCase())) continue;

		const evidenceIds = (s.sourcePolicyIds ?? [])
			.filter((i) => i >= 0 && i < eligiblePolicies.length)
			.map((i) => eligiblePolicies[i].id);

		localDb
			.insert(memorySkills)
			.values({
				projectId: episode.projectId,
				name: s.name,
				invocationGuide: s.invocationGuide,
				procedureJson: s.procedure ?? null,
				eta: 0.5,
				status: "candidate",
				scope: s.scope === "project" ? "project" : "global",
				evidenceAnchors: evidenceIds.length > 0 ? evidenceIds : null,
			})
			.run();
		created++;
	}

	console.log("[pipeline] crystallizeSkills: created", created, "skills");
}

// ---------------------------------------------------------------------------
// Pipeline Step 6b: Promote candidate skills after enough trials
// ---------------------------------------------------------------------------

function promoteSkills() {
	const CANDIDATE_TRIALS = 3;
	const MIN_ETA = 0.6;

	const candidates = localDb
		.select()
		.from(memorySkills)
		.where(eq(memorySkills.status, "candidate"))
		.all();

	for (const skill of candidates) {
		if (skill.trialsAttempted >= CANDIDATE_TRIALS && skill.eta >= MIN_ETA) {
			localDb
				.update(memorySkills)
				.set({ status: "active", updatedAt: Date.now() })
				.where(eq(memorySkills.id, skill.id))
				.run();
			console.log("[pipeline] promoted skill to active:", skill.name);
		}
	}
}

// ---------------------------------------------------------------------------
// Pipeline Step 6c: Update skill eta from episode feedback
// ---------------------------------------------------------------------------

function updateSkillFeedback(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) return;

	const traces = localDb
		.select()
		.from(memoryTraces)
		.where(eq(memoryTraces.episodeId, episodeId))
		.all();
	if (traces.length === 0) return;

	const allSkills = localDb
		.select()
		.from(memorySkills)
		.where(
			or(
				eq(memorySkills.status, "active"),
				eq(memorySkills.status, "candidate"),
			),
		)
		.all();
	if (allSkills.length === 0) return;

	const traceText = traces
		.map((t) => [t.userText, t.agentText].filter(Boolean).join(" "))
		.join(" ")
		.toLowerCase();

	const toolNames = new Set<string>();
	for (const t of traces) {
		if (t.toolCalls) {
			for (const call of t.toolCalls as Array<{ tool: string }>) {
				toolNames.add(call.tool.toLowerCase());
			}
		}
	}

	const passed = episode.rHuman !== null && episode.rHuman >= 0.5;

	for (const skill of allSkills) {
		const nameWords = skill.name.toLowerCase().split(/\s+/);
		const mentioned =
			nameWords.every((w) => traceText.includes(w)) ||
			toolNames.has(skill.name.toLowerCase());

		if (!mentioned) continue;

		const newAttempted = skill.trialsAttempted + 1;
		const newPassed = passed ? skill.trialsPassed + 1 : skill.trialsPassed;
		const eta = newAttempted > 0 ? newPassed / newAttempted : 0;

		localDb
			.update(memorySkills)
			.set({
				trialsAttempted: newAttempted,
				trialsPassed: newPassed,
				eta,
				updatedAt: Date.now(),
			})
			.where(eq(memorySkills.id, skill.id))
			.run();

		console.log("[pipeline] skill feedback:", {
			skill: skill.name,
			attempted: newAttempted,
			passed: newPassed,
			eta: eta.toFixed(3),
		});
	}
}

// ---------------------------------------------------------------------------
// Pipeline Step 7: Update policy gain from episode reward
// ---------------------------------------------------------------------------

function updatePolicyGains(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode?.rHuman) return;

	const allPolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			or(
				eq(memoryPolicies.status, "active"),
				eq(memoryPolicies.status, "candidate"),
			),
		)
		.all();

	for (const policy of allPolicies) {
		const episodes = (policy.sourceEpisodeIds as string[] | null) ?? [];
		if (!episodes.includes(episodeId)) continue;

		const currentGain = policy.gain ?? 0;
		const newGain =
			currentGain === 0
				? episode.rHuman
				: 0.7 * currentGain + 0.3 * episode.rHuman;

		localDb
			.update(memoryPolicies)
			.set({ gain: newGain, updatedAt: Date.now() })
			.where(eq(memoryPolicies.id, policy.id))
			.run();
	}
}

// ---------------------------------------------------------------------------
// Pipeline Step 8: Compute embeddings for entries missing vecSummary
// ---------------------------------------------------------------------------

async function computeEmbeddings(episodeId: string) {
	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();

	const scopeCondition = episode?.projectId
		? or(
				eq(memoryPolicies.scope, "global"),
				eq(memoryPolicies.projectId, episode.projectId),
			)
		: eq(memoryPolicies.scope, "global");

	const unemdPolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			and(
				sql`${memoryPolicies.vecSummary} IS NULL`,
				or(
					eq(memoryPolicies.status, "active"),
					eq(memoryPolicies.status, "candidate"),
				),
				scopeCondition,
			),
		)
		.limit(50)
		.all();

	for (const p of unemdPolicies) {
		const text = `${p.trigger} ${p.procedure}`;
		const vec = await computeEmbedding(text);
		if (vec) {
			localDb
				.update(memoryPolicies)
				.set({ vecSummary: vec })
				.where(eq(memoryPolicies.id, p.id))
				.run();
		}
	}

	const wmScopeCondition = episode?.projectId
		? or(
				eq(memoryWorldModels.scope, "global"),
				eq(memoryWorldModels.projectId, episode.projectId),
			)
		: eq(memoryWorldModels.scope, "global");

	const unemdModels = localDb
		.select()
		.from(memoryWorldModels)
		.where(
			and(
				sql`${memoryWorldModels.vecSummary} IS NULL`,
				eq(memoryWorldModels.status, "active"),
				wmScopeCondition,
			),
		)
		.limit(30)
		.all();

	for (const m of unemdModels) {
		const vec = await computeEmbedding(m.content);
		if (vec) {
			localDb
				.update(memoryWorldModels)
				.set({ vecSummary: vec })
				.where(eq(memoryWorldModels.id, m.id))
				.run();
		}
	}

	const skillScopeCondition = episode?.projectId
		? or(
				eq(memorySkills.scope, "global"),
				eq(memorySkills.projectId, episode.projectId),
			)
		: eq(memorySkills.scope, "global");

	const unemdSkills = localDb
		.select()
		.from(memorySkills)
		.where(
			and(
				sql`${memorySkills.vecSummary} IS NULL`,
				or(
					eq(memorySkills.status, "active"),
					eq(memorySkills.status, "candidate"),
				),
				skillScopeCondition,
			),
		)
		.limit(20)
		.all();

	for (const s of unemdSkills) {
		const text = `${s.name} ${s.invocationGuide}`;
		const vec = await computeEmbedding(text);
		if (vec) {
			localDb
				.update(memorySkills)
				.set({ vecSummary: vec })
				.where(eq(memorySkills.id, s.id))
				.run();
		}
	}

	const total = unemdPolicies.length + unemdModels.length + unemdSkills.length;
	if (total > 0) {
		console.log("[pipeline] computeEmbeddings:", {
			policies: unemdPolicies.length,
			worldModels: unemdModels.length,
			skills: unemdSkills.length,
		});
	}
}

// ---------------------------------------------------------------------------
// Core pipeline orchestration (callable directly, not only via tRPC)
// ---------------------------------------------------------------------------

export async function runPipeline(episodeId: string) {
	console.log("[pipeline] processEpisode started:", episodeId);

	const episode = localDb
		.select()
		.from(memoryEpisodes)
		.where(eq(memoryEpisodes.id, episodeId))
		.get();
	if (!episode) {
		return { success: false, reason: "episode_not_found" as const };
	}

	const results = {
		scored: false,
		alphasScored: false,
		backpropped: false,
		gainsUpdated: false,
		policiesInduced: false,
		policiesPromoted: false,
		worldModelsAbstracted: false,
		skillsCrystallized: false,
		skillsPromoted: false,
		skillFeedback: false,
		embedded: false,
		synced: false,
	};

	try {
		await scoreEpisode(episodeId);
		results.scored = true;
	} catch (e) {
		console.error("[pipeline] scoreEpisode failed:", e);
	}

	try {
		await scoreAlphas(episodeId);
		results.alphasScored = true;
	} catch (e) {
		console.error("[pipeline] scoreAlphas failed:", e);
	}

	try {
		backpropReward(episodeId);
		results.backpropped = true;
	} catch (e) {
		console.error("[pipeline] backpropReward failed:", e);
	}

	try {
		updatePolicyGains(episodeId);
		results.gainsUpdated = true;
	} catch (e) {
		console.error("[pipeline] updatePolicyGains failed:", e);
	}

	try {
		await inducePolicies(episodeId);
		results.policiesInduced = true;
	} catch (e) {
		console.error("[pipeline] inducePolicies failed:", e);
	}

	try {
		promotePolicies();
		results.policiesPromoted = true;
	} catch (e) {
		console.error("[pipeline] promotePolicies failed:", e);
	}

	try {
		await abstractWorldModels(episodeId);
		results.worldModelsAbstracted = true;
	} catch (e) {
		console.error("[pipeline] abstractWorldModels failed:", e);
	}

	try {
		await crystallizeSkills(episodeId);
		results.skillsCrystallized = true;
	} catch (e) {
		console.error("[pipeline] crystallizeSkills failed:", e);
	}

	try {
		promoteSkills();
		results.skillsPromoted = true;
	} catch (e) {
		console.error("[pipeline] promoteSkills failed:", e);
	}

	try {
		updateSkillFeedback(episodeId);
		results.skillFeedback = true;
	} catch (e) {
		console.error("[pipeline] updateSkillFeedback failed:", e);
	}

	try {
		await computeEmbeddings(episodeId);
		results.embedded = true;
	} catch (e) {
		console.error("[pipeline] computeEmbeddings failed:", e);
	}

	try {
		syncCognitiveMemoryToFiles(episode.projectId ?? undefined);
		results.synced = true;
	} catch (e) {
		console.error("[pipeline] syncFiles failed:", e);
	}

	console.log("[pipeline] processEpisode complete:", results);
	return { success: true, results };
}

// ---------------------------------------------------------------------------
// Exported Pipeline Router
// ---------------------------------------------------------------------------

export const createPipelineRouter = () => {
	return router({
		processEpisode: publicProcedure
			.input(z.object({ episodeId: z.string() }))
			.mutation(async ({ input }) => {
				return runPipeline(input.episodeId);
			}),
	});
};
