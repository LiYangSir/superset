import {
	memories,
	memoryEpisodes,
	memoryPolicies,
	memorySkills,
	memoryTraces,
	memoryWorldModels,
} from "@superset/local-db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getConfiguredAiCliAgent, runAiCliWithTempCwd } from "../utils/ai-cli";
import { getWorkspaceWithRelations } from "../workspaces/utils/db-helpers";
import { runPipeline } from "./pipeline";
import {
	parseTranscriptToTraces,
	readFullClaudeSession,
	readLatestClaudeSession,
} from "./session-reader";
import {
	formatMemoriesAsMarkdown,
	regenerateGlobalMemoryFile,
	regenerateProjectMemoryFile,
} from "./sync";

export const createLegacyMemoryRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						scope: z.enum(["global", "project"]).optional(),
						projectId: z.string().optional(),
					})
					.optional(),
			)
			.query(({ input }) => {
				const conditions = [];

				if (input?.scope) {
					conditions.push(eq(memories.scope, input.scope));
				}

				if (input?.projectId) {
					conditions.push(
						or(
							eq(memories.scope, "global"),
							eq(memories.projectId, input.projectId),
						),
					);
				}

				if (input?.scope === "global") {
					conditions.push(isNull(memories.projectId));
				}

				const query =
					conditions.length > 0
						? localDb
								.select()
								.from(memories)
								.where(and(...conditions))
								.orderBy(desc(memories.updatedAt))
								.all()
						: localDb
								.select()
								.from(memories)
								.orderBy(desc(memories.updatedAt))
								.all();

				return query;
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(memories)
					.where(eq(memories.id, input.id))
					.get();
			}),

		create: publicProcedure
			.input(
				z.object({
					content: z.string().min(1),
					scope: z.enum(["global", "project"]),
					projectId: z.string().optional(),
					category: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const result = localDb
					.insert(memories)
					.values({
						content: input.content,
						scope: input.scope,
						projectId: input.scope === "project" ? input.projectId : null,
						category: input.category || null,
					})
					.returning()
					.get();

				if (input.scope === "global") {
					regenerateGlobalMemoryFile();
				} else if (input.projectId) {
					regenerateProjectMemoryFile(input.projectId);
				}

				return result;
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					content: z.string().min(1),
					category: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(memories)
					.where(eq(memories.id, input.id))
					.get();

				const result = localDb
					.update(memories)
					.set({
						content: input.content,
						category: input.category,
						updatedAt: Date.now(),
					})
					.where(eq(memories.id, input.id))
					.returning()
					.get();

				if (existing?.scope === "global") {
					regenerateGlobalMemoryFile();
				} else if (existing?.projectId) {
					regenerateProjectMemoryFile(existing.projectId);
				}

				return result;
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(memories)
					.where(eq(memories.id, input.id))
					.get();

				localDb.delete(memories).where(eq(memories.id, input.id)).run();

				if (existing?.scope === "global") {
					regenerateGlobalMemoryFile();
				} else if (existing?.projectId) {
					regenerateProjectMemoryFile(existing.projectId);
				}

				return { success: true };
			}),

		getForSession: publicProcedure
			.input(z.object({ projectId: z.string().optional() }))
			.query(({ input }) => {
				const parts: string[] = [];

				// --- Cognitive memory (three-tier retrieval) ---
				const projCond = input.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, input.projectId),
						)
					: eq(memoryPolicies.scope, "global");

				const activeSkills = localDb
					.select()
					.from(memorySkills)
					.where(
						and(
							eq(memorySkills.status, "active"),
							input.projectId
								? or(
										eq(memorySkills.scope, "global"),
										eq(memorySkills.projectId, input.projectId),
									)
								: eq(memorySkills.scope, "global"),
						),
					)
					.orderBy(desc(memorySkills.eta))
					.limit(5)
					.all();

				const activePolicies = localDb
					.select()
					.from(memoryPolicies)
					.where(and(eq(memoryPolicies.status, "active"), projCond))
					.orderBy(desc(memoryPolicies.support), desc(memoryPolicies.gain))
					.limit(30)
					.all();

				const activeWorldModels = localDb
					.select()
					.from(memoryWorldModels)
					.where(
						and(
							eq(memoryWorldModels.status, "active"),
							input.projectId
								? or(
										eq(memoryWorldModels.scope, "global"),
										eq(memoryWorldModels.projectId, input.projectId),
									)
								: eq(memoryWorldModels.scope, "global"),
						),
					)
					.orderBy(desc(memoryWorldModels.confidence))
					.limit(15)
					.all();

				if (activeSkills.length > 0) {
					const lines = ["## Crystallized Skills"];
					for (const s of activeSkills) {
						lines.push(`- **${s.name}**: ${s.invocationGuide}`);
					}
					parts.push(lines.join("\n"));
				}

				if (activePolicies.length > 0) {
					const lines = ["## Policies"];
					const byCategory = new Map<string, typeof activePolicies>();
					for (const p of activePolicies) {
						const cat = p.category || "General";
						if (!byCategory.has(cat)) byCategory.set(cat, []);
						byCategory.get(cat)?.push(p);
					}
					for (const [cat, policies] of byCategory) {
						lines.push(`### ${cat}`);
						for (const p of policies) {
							lines.push(`- WHEN ${p.trigger} THEN ${p.procedure}`);
						}
					}
					parts.push(lines.join("\n"));
				}

				const envModels = activeWorldModels.filter(
					(m) => m.modelType === "environment",
				);
				const infModels = activeWorldModels.filter(
					(m) => m.modelType === "inference",
				);
				const conModels = activeWorldModels.filter(
					(m) => m.modelType === "constraint",
				);
				if (envModels.length > 0) {
					parts.push(
						[
							"## Environment Knowledge",
							...envModels.map((m) => `- ${m.content}`),
						].join("\n"),
					);
				}
				if (infModels.length > 0) {
					parts.push(
						[
							"## Behavioral Rules",
							...infModels.map((m) => `- ${m.content}`),
						].join("\n"),
					);
				}
				if (conModels.length > 0) {
					parts.push(
						["## Constraints", ...conModels.map((m) => `- ${m.content}`)].join(
							"\n",
						),
					);
				}

				// --- Legacy flat memories (fallback / supplement) ---
				const globalMems = localDb
					.select()
					.from(memories)
					.where(eq(memories.scope, "global"))
					.orderBy(desc(memories.updatedAt))
					.all();

				let projectMems: typeof globalMems = [];
				if (input.projectId) {
					projectMems = localDb
						.select()
						.from(memories)
						.where(
							and(
								eq(memories.scope, "project"),
								eq(memories.projectId, input.projectId),
							),
						)
						.orderBy(desc(memories.updatedAt))
						.all();
				}

				if (globalMems.length > 0) {
					parts.push(formatMemoriesAsMarkdown("Global Memory", globalMems));
				}
				if (projectMems.length > 0) {
					parts.push(formatMemoriesAsMarkdown("Project Memory", projectMems));
				}

				return parts.length > 0 ? parts.join("\n\n") : null;
			}),

		regenerateFiles: publicProcedure
			.input(z.object({ projectId: z.string().optional() }))
			.mutation(({ input }) => {
				regenerateGlobalMemoryFile();
				if (input.projectId) {
					regenerateProjectMemoryFile(input.projectId);
				}
				return { success: true };
			}),

		consolidate: publicProcedure
			.input(z.object({ projectId: z.string().optional() }))
			.mutation(async ({ input }) => {
				console.log("[memory] consolidate called:", {
					projectId: input.projectId,
				});

				const existingMemories = localDb
					.select()
					.from(memories)
					.where(
						input.projectId
							? or(
									eq(memories.scope, "global"),
									and(
										eq(memories.scope, "project"),
										eq(memories.projectId, input.projectId),
									),
								)
							: eq(memories.scope, "global"),
					)
					.orderBy(desc(memories.updatedAt))
					.all();

				if (existingMemories.length === 0) {
					return { success: true, categories: 0 };
				}

				const grouped = new Map<string, Map<string, string[]>>();
				for (const m of existingMemories) {
					const scope = m.scope;
					const cat = m.category || "General";
					let scopeMap = grouped.get(scope);
					if (!scopeMap) {
						scopeMap = new Map();
						grouped.set(scope, scopeMap);
					}
					if (!scopeMap.has(cat)) scopeMap.set(cat, []);
					scopeMap.get(cat)?.push(m.content);
				}

				const sections: string[] = [];
				const globalCats = grouped.get("global");
				if (globalCats) {
					sections.push("## Global (user-level)");
					for (const [cat, items] of globalCats) {
						sections.push(`### ${cat}`);
						for (const item of items) {
							sections.push(`- ${item}`);
						}
					}
				}
				const projectCats = grouped.get("project");
				if (projectCats) {
					sections.push("## Project-level");
					for (const [cat, items] of projectCats) {
						sections.push(`### ${cat}`);
						for (const item of items) {
							sections.push(`- ${item}`);
						}
					}
				}

				try {
					const result = await runAiCliWithTempCwd(
						`You reorganize a memory system. Below are all existing memories. Your job: consolidate them into ONE entry per category per scope. Merge duplicates, remove outdated info, and produce clean bullet-point lists.

There are two scopes:
- "global": User profile — coding preferences, communication style, workflow habits, tools, expertise, role, general preferences.
- "project": Project-specific — tech stack, architecture decisions, naming conventions, requirements, team conventions.

Existing memories:
${sections.join("\n")}

Return a JSON array. Each object represents ONE category entry:
- "category": string (the category label)
- "scope": "global" | "project"
- "content": string (consolidated bullet list, each item on its own line prefixed with "- ")

Rules:
- ONE entry per category per scope
- Merge semantically duplicate items into one bullet
- Remove clearly outdated or contradicted observations
- Preserve all unique, valuable information
- Do NOT wrap the JSON in markdown code fences`,
						{
							agent: getConfiguredAiCliAgent(),
							timeoutMs: 120_000,
						},
					);

					if (!result.ok) {
						console.log("[memory] consolidate CLI error:", result.reason);
						return { success: false, reason: result.reason };
					}

					const text = result.text;

					const jsonMatch = text.match(/\[[\s\S]*\]/);
					if (!jsonMatch) {
						console.log(
							"[memory] consolidate: no JSON found:",
							text.slice(0, 300),
						);
						return { success: false, reason: "no_json" as const };
					}

					const parsed = JSON.parse(jsonMatch[0]) as Array<{
						category?: string;
						scope?: "global" | "project";
						content?: string;
					}>;

					const validScopes = new Set<"global" | "project">([
						"global",
						"project",
					]);
					const validItems = parsed.flatMap((item) => {
						if (
							typeof item.content !== "string" ||
							typeof item.category !== "string" ||
							!item.scope ||
							!validScopes.has(item.scope)
						) {
							return [];
						}
						return [
							{
								content: item.content,
								category: item.category,
								scope: item.scope,
							},
						];
					});

					if (validItems.length === 0) {
						return { success: true, categories: 0 };
					}

					const hasGlobal = validItems.some((i) => i.scope === "global");
					const hasProject = validItems.some((i) => i.scope === "project");

					if (hasGlobal) {
						localDb.delete(memories).where(eq(memories.scope, "global")).run();
					}
					if (hasProject && input.projectId) {
						localDb
							.delete(memories)
							.where(
								and(
									eq(memories.scope, "project"),
									eq(memories.projectId, input.projectId),
								),
							)
							.run();
					}

					for (const item of validItems) {
						const itemProjectId =
							item.scope === "project" ? input.projectId || null : null;
						if (item.scope === "project" && !itemProjectId) continue;
						localDb
							.insert(memories)
							.values({
								content: item.content,
								scope: item.scope,
								projectId: itemProjectId,
								category: item.category,
							})
							.run();
					}

					if (hasGlobal) regenerateGlobalMemoryFile();
					if (hasProject && input.projectId)
						regenerateProjectMemoryFile(input.projectId);

					console.log("[memory] consolidate complete:", {
						categories: validItems.length,
					});
					return { success: true, categories: validItems.length };
				} catch (error) {
					console.error("[memory] consolidate failed:", error);
					return { success: false, reason: "exception" as const };
				}
			}),

		summarizeSession: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().optional(),
					projectId: z.string().optional(),
					projectPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log("[memory] summarizeSession called:", {
					workspaceId: input.workspaceId,
					projectId: input.projectId,
				});

				let projectId = input.projectId;
				let projectPath = input.projectPath;

				if (input.workspaceId && (!projectId || !projectPath)) {
					const relations = getWorkspaceWithRelations(input.workspaceId);
					if (relations?.project) {
						projectId = projectId || relations.project.id;
						projectPath = projectPath || relations.project.mainRepoPath;
					}
				}

				// Always fire cognitive episode creation (uses readFullClaudeSession with no time limit)
				createCognitiveEpisode(projectPath, projectId).catch((e) =>
					console.error("[memory] cognitive episode creation failed:", e),
				);

				console.log("[memory] Reading session transcript:", { projectPath });
				const transcript = readLatestClaudeSession(projectPath);
				if (!transcript) {
					console.log(
						"[memory] No recent transcript found (must be <30min old)",
					);
					return { success: false, reason: "no_transcript" as const };
				}
				console.log(
					"[memory] Transcript found, length:",
					transcript.length,
					"- calling CLI agent:",
					getConfiguredAiCliAgent(),
				);

				const existingMemories = localDb
					.select()
					.from(memories)
					.where(
						projectId
							? or(
									eq(memories.scope, "global"),
									and(
										eq(memories.scope, "project"),
										eq(memories.projectId, projectId),
									),
								)
							: eq(memories.scope, "global"),
					)
					.orderBy(desc(memories.updatedAt))
					.all();

				let existingMemoriesSection = "";
				if (existingMemories.length > 0) {
					const grouped = new Map<string, Map<string, string[]>>();
					for (const m of existingMemories) {
						const scope = m.scope;
						const cat = m.category || "General";
						let scopeMap = grouped.get(scope);
						if (!scopeMap) {
							scopeMap = new Map();
							grouped.set(scope, scopeMap);
						}
						if (!scopeMap.has(cat)) scopeMap.set(cat, []);
						scopeMap.get(cat)?.push(m.content);
					}

					const sections: string[] = [];
					const globalCats = grouped.get("global");
					if (globalCats) {
						sections.push("## Global (user-level)");
						for (const [cat, items] of globalCats) {
							sections.push(`### ${cat}`);
							for (const item of items) {
								sections.push(`- ${item}`);
							}
						}
					}
					const projectCats = grouped.get("project");
					if (projectCats) {
						sections.push("## Project-level");
						for (const [cat, items] of projectCats) {
							sections.push(`### ${cat}`);
							for (const item of items) {
								sections.push(`- ${item}`);
							}
						}
					}
					existingMemoriesSection = `\n\nExisting memories:\n${sections.join("\n")}\n`;
				}

				try {
					const result = await runAiCliWithTempCwd(
						`You reorganize a memory system. You receive all existing memories and a new session transcript. Your job: produce a COMPLETE, reorganized set of memories. Each category should contain ONE consolidated bullet-point list. Merge duplicates, remove outdated info, and integrate any new observations from the transcript.

There are two scopes:
- "global": User profile — coding preferences, communication style, workflow habits, tools, expertise, role, general preferences. These travel across ALL projects.
- "project": Project-specific — tech stack, architecture decisions, naming conventions, requirements, team conventions, patterns unique to this project.

Suggested categories (use these or another fitting label):
- "Coding Preferences": language, framework, naming conventions, code style
- "Communication Style": preferred language, reply verbosity, interaction mode
- "Workflow": common tools, Git habits, development process
- "Project Context": tech stack, architecture decisions, team conventions
- "Profile": role, responsibilities, goals, focus areas
- "Patterns": recurring code patterns, abstractions, idioms
- "Requirements": project constraints, acceptance criteria
${existingMemoriesSection}
New session transcript:
${transcript}

Return a JSON array. Each object represents ONE category entry:
- "category": string (the category label)
- "scope": "global" | "project"
- "content": string (consolidated bullet list, each item on its own line prefixed with "- ")

Rules:
- ONE entry per category per scope — consolidate all related items into a single content string
- When in doubt: user preferences/habits → "global", codebase specifics → "project"
- Merge semantically duplicate items into one bullet
- Remove clearly outdated or contradicted observations
- If nothing noteworthy from the transcript, return existing memories reorganized (still consolidate duplicates)
- Return [] only if there truly are no memories worth keeping
- Do NOT wrap the JSON in markdown code fences`,
						{
							agent: getConfiguredAiCliAgent(),
							timeoutMs: 120_000,
						},
					);

					if (!result.ok) {
						console.log("[memory] CLI error:", result.reason);
						return { success: false, reason: result.reason };
					}

					const text = result.text;

					const jsonMatch = text.match(/\[[\s\S]*\]/);
					if (!jsonMatch) {
						console.log(
							"[memory] No JSON array found in response:",
							text.slice(0, 300),
						);
						return { success: false, reason: "no_json" as const };
					}

					const parsed = JSON.parse(jsonMatch[0]) as Array<{
						category?: string;
						scope?: "global" | "project";
						content?: string;
					}>;

					console.log("[memory] Parsed categories:", parsed.length);

					if (!Array.isArray(parsed) || parsed.length === 0) {
						console.log("[memory] No memories returned from reorganization");
						return { success: true, categories: 0 };
					}

					const validScopes = new Set<"global" | "project">([
						"global",
						"project",
					]);
					const validItems = parsed.flatMap((item) => {
						if (
							typeof item.content !== "string" ||
							typeof item.category !== "string" ||
							!item.scope ||
							!validScopes.has(item.scope)
						) {
							return [];
						}
						return [
							{
								content: item.content,
								category: item.category,
								scope: item.scope,
							},
						];
					});

					if (validItems.length === 0) {
						console.log("[memory] No valid items after filtering");
						return { success: true, categories: 0 };
					}

					const hasGlobal = validItems.some((i) => i.scope === "global");
					const hasProject = validItems.some((i) => i.scope === "project");

					if (hasGlobal) {
						localDb.delete(memories).where(eq(memories.scope, "global")).run();
					}
					if (hasProject && projectId) {
						localDb
							.delete(memories)
							.where(
								and(
									eq(memories.scope, "project"),
									eq(memories.projectId, projectId),
								),
							)
							.run();
					}

					for (const item of validItems) {
						const itemProjectId =
							item.scope === "project" ? projectId || null : null;
						if (item.scope === "project" && !itemProjectId) continue;
						localDb
							.insert(memories)
							.values({
								content: item.content,
								scope: item.scope,
								projectId: itemProjectId,
								category: item.category,
							})
							.run();
					}

					if (hasGlobal) {
						regenerateGlobalMemoryFile();
					}
					if (hasProject && projectId) {
						regenerateProjectMemoryFile(projectId);
					}

					console.log("[memory] summarizeSession complete:", {
						categories: validItems.length,
					});

					return { success: true, categories: validItems.length };
				} catch (error) {
					console.error("[memory] Summarization failed:", error);
					return { success: false, reason: "exception" as const };
				}
			}),
	});
};

async function createCognitiveEpisode(
	projectPath?: string,
	projectId?: string,
) {
	const rawMessages = readFullClaudeSession(projectPath);
	if (!rawMessages || rawMessages.length === 0) {
		console.log("[memory] cognitive: no session messages found");
		return;
	}

	const turns = parseTranscriptToTraces(rawMessages);
	if (turns.length === 0) {
		console.log("[memory] cognitive: no turns parsed");
		return;
	}

	const firstUserText = turns.find((t) => t.userText)?.userText;
	const title = firstUserText
		? firstUserText.slice(0, 100) + (firstUserText.length > 100 ? "..." : "")
		: "Agent Session";

	const episode = localDb
		.insert(memoryEpisodes)
		.values({
			projectId: projectId ?? null,
			title,
			status: "finalized",
			traceCount: turns.length,
		})
		.returning()
		.get();

	localDb.transaction((tx) => {
		for (const turn of turns) {
			tx.insert(memoryTraces)
				.values({
					episodeId: episode.id,
					projectId: projectId ?? null,
					turnIndex: turn.turnIndex,
					userText: turn.userText,
					agentText: turn.agentText ? turn.agentText.slice(0, 2000) : null,
					toolCalls: turn.toolCalls.length > 0 ? turn.toolCalls : null,
					agentThinking: turn.agentThinking
						? turn.agentThinking.slice(0, 1000)
						: null,
					tags: turn.tags.length > 0 ? turn.tags : null,
					errorSignatures:
						turn.errorSignatures.length > 0 ? turn.errorSignatures : null,
				})
				.run();
		}
	});

	console.log(
		"[memory] cognitive: created episode",
		episode.id,
		"with",
		turns.length,
		"traces — triggering pipeline",
	);

	await runPipeline(episode.id);
}
