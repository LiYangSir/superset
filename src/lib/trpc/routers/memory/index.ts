import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { memories, projects, settings } from "@superset/local-db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspaceWithRelations } from "../workspaces/utils/db-helpers";
import { readLatestClaudeSession } from "./session-reader";

const SUPERSET_DIR_NAME = process.env.SUPERSET_DIR_NAME || ".superset";
const SUPERSET_MEMORY_PREFIX = "superset-";

function getSupersetHomeDir(): string {
	return (
		process.env.SUPERSET_HOME_DIR || path.join(os.homedir(), SUPERSET_DIR_NAME)
	);
}

function encodeProjectPath(projectPath: string): string {
	return projectPath.replace(/\//g, "-");
}

function getClaudeMemoryDir(projectPath: string): string {
	const encoded = encodeProjectPath(projectPath);
	return path.join(os.homedir(), ".claude", "projects", encoded, "memory");
}

function categoryToSlug(category: string): string {
	return category
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
}

function syncToClaudeMemory(projectPath: string, projectId?: string) {
	const globalMems = localDb
		.select()
		.from(memories)
		.where(eq(memories.scope, "global"))
		.orderBy(desc(memories.updatedAt))
		.all();

	let projectMems: typeof globalMems = [];
	if (projectId) {
		projectMems = localDb
			.select()
			.from(memories)
			.where(
				and(eq(memories.scope, "project"), eq(memories.projectId, projectId)),
			)
			.orderBy(desc(memories.updatedAt))
			.all();
	}

	const memoryDir = getClaudeMemoryDir(projectPath);
	fs.mkdirSync(memoryDir, { recursive: true });

	// Clean up old superset-managed files
	try {
		for (const file of fs.readdirSync(memoryDir)) {
			if (file.startsWith(SUPERSET_MEMORY_PREFIX) && file.endsWith(".md")) {
				fs.unlinkSync(path.join(memoryDir, file));
			}
		}
	} catch {}

	const allMems = [...globalMems, ...projectMems];
	if (allMems.length === 0) {
		updateMemoryIndex(memoryDir, []);
		return;
	}

	const grouped = new Map<
		string,
		{ scope: string; items: string[] }
	>();
	for (const mem of allMems) {
		const cat = mem.category || "General";
		if (!grouped.has(cat)) {
			grouped.set(cat, { scope: mem.scope, items: [] });
		}
		grouped.get(cat)!.items.push(mem.content);
	}

	const entries: Array<{ slug: string; name: string; description: string }> =
		[];

	for (const [category, { scope, items }] of grouped) {
		const slug = categoryToSlug(category);
		const fileName = `${SUPERSET_MEMORY_PREFIX}${slug}.md`;
		const memType = scope === "project" ? "project" : "user";

		const content = [
			"---",
			`name: ${category}`,
			`description: ${category} - synced from Superset`,
			`type: ${memType}`,
			"---",
			"",
			...items.map((item) =>
				item.includes("\n") ? item : `- ${item}`,
			),
			"",
		].join("\n");

		writeMemoryFile(path.join(memoryDir, fileName), content);
		entries.push({
			slug,
			name: category,
			description: `${category} (Superset)`,
		});
	}

	updateMemoryIndex(memoryDir, entries);
}

function updateMemoryIndex(
	memoryDir: string,
	entries: Array<{ slug: string; name: string; description: string }>,
) {
	const indexPath = path.join(memoryDir, "MEMORY.md");

	let existingLines: string[] = [];
	try {
		existingLines = fs
			.readFileSync(indexPath, "utf-8")
			.split("\n")
			.filter(
				(line) =>
					line.trim() &&
					!line.includes(`(${SUPERSET_MEMORY_PREFIX}`),
			);
	} catch {}

	const newLines = entries.map(
		(e) =>
			`- [${e.name}](${SUPERSET_MEMORY_PREFIX}${e.slug}.md) — ${e.description}`,
	);

	const allLines = [...existingLines, ...newLines];

	if (allLines.length === 0) {
		try {
			fs.unlinkSync(indexPath);
		} catch {}
		return;
	}

	writeMemoryFile(indexPath, allLines.join("\n") + "\n");
}

function formatMemoriesAsMarkdown(
	title: string,
	mems: Array<{ content: string; category: string | null }>,
): string {
	const grouped = new Map<string, string[]>();
	for (const mem of mems) {
		const cat = mem.category || "General";
		if (!grouped.has(cat)) grouped.set(cat, []);
		grouped.get(cat)!.push(mem.content);
	}

	const lines = [`# ${title}`, ""];
	for (const [category, items] of grouped) {
		lines.push(`## ${category}`);
		for (const item of items) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function writeMemoryFile(filePath: string, content: string) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	fs.writeFileSync(tmpPath, content);
	fs.renameSync(tmpPath, filePath);
}

function regenerateGlobalMemoryFile() {
	const globalMemories = localDb
		.select()
		.from(memories)
		.where(eq(memories.scope, "global"))
		.orderBy(desc(memories.updatedAt))
		.all();

	const filePath = path.join(getSupersetHomeDir(), "memory.md");

	if (globalMemories.length === 0) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	} else {
		writeMemoryFile(
			filePath,
			formatMemoriesAsMarkdown("Superset Memory (Global)", globalMemories),
		);
	}

	// Sync to Claude Code native memory for all known projects
	const allProjects = localDb.select().from(projects).all();
	for (const project of allProjects) {
		if (project.mainRepoPath) {
			syncToClaudeMemory(project.mainRepoPath, project.id);
		}
	}
}

function regenerateProjectMemoryFile(projectId: string) {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) return;

	const projectMemories = localDb
		.select()
		.from(memories)
		.where(
			and(eq(memories.scope, "project"), eq(memories.projectId, projectId)),
		)
		.orderBy(desc(memories.updatedAt))
		.all();

	const filePath = path.join(project.mainRepoPath, ".superset", "memory.md");

	if (projectMemories.length === 0) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	} else {
		writeMemoryFile(
			filePath,
			formatMemoriesAsMarkdown(`Superset Memory (${project.name})`, projectMemories),
		);
	}

	// Sync to Claude Code native memory
	if (project.mainRepoPath) {
		syncToClaudeMemory(project.mainRepoPath, projectId);
	}
}

export const createMemoryRouter = () => {
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

				if (globalMems.length === 0 && projectMems.length === 0) {
					return null;
				}

				const parts: string[] = [];

				if (globalMems.length > 0) {
					parts.push(
						formatMemoriesAsMarkdown("Global Memory", globalMems),
					);
				}

				if (projectMems.length > 0) {
					parts.push(
						formatMemoriesAsMarkdown("Project Memory", projectMems),
					);
				}

				return parts.join("\n");
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
				console.log("[memory] consolidate called:", { projectId: input.projectId });

				const settingsRow = localDb.select().from(settings).get();
				const apiKey =
					settingsRow?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					return { success: false, reason: "no_api_key" as const };
				}
				const baseUrl =
					settingsRow?.anthropicBaseUrl || "https://api.anthropic.com";
				const model =
					settingsRow?.anthropicModel || "deepseek-v4-flash";

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
					if (!grouped.has(scope)) grouped.set(scope, new Map());
					const scopeMap = grouped.get(scope)!;
					if (!scopeMap.has(cat)) scopeMap.set(cat, []);
					scopeMap.get(cat)!.push(m.content);
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
					const response = await fetch(`${baseUrl}/v1/messages`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-api-key": apiKey,
							"anthropic-version": "2023-06-01",
							"User-Agent": "claude-cli/2.1.44 (external, sdk-cli)",
						},
						body: JSON.stringify({
							model,
							max_tokens: 4096,
							messages: [
								{
									role: "user",
									content: `You reorganize a memory system. Below are all existing memories. Your job: consolidate them into ONE entry per category per scope. Merge duplicates, remove outdated info, and produce clean bullet-point lists.

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
								},
							],
						}),
					});

					if (!response.ok) {
						const errBody = await response.text().catch(() => "");
						console.log("[memory] consolidate API error:", response.status, errBody.slice(0, 200));
						return { success: false, reason: "api_error" as const };
					}

					const data = (await response.json()) as {
						content: Array<{ type: string; text?: string }>;
					};
					const text = data.content
						?.find((c) => c.type === "text")
						?.text?.trim();

					if (!text) {
						return { success: false, reason: "empty_response" as const };
					}

					const jsonMatch = text.match(/\[[\s\S]*\]/);
					if (!jsonMatch) {
						console.log("[memory] consolidate: no JSON found:", text.slice(0, 300));
						return { success: false, reason: "no_json" as const };
					}

					const parsed = JSON.parse(jsonMatch[0]) as Array<{
						category?: string;
						scope?: "global" | "project";
						content?: string;
					}>;

					const validScopes = new Set(["global", "project"]);
					const validItems = parsed.filter(
						(item) =>
							item.content &&
							typeof item.content === "string" &&
							item.category &&
							typeof item.category === "string" &&
							item.scope &&
							validScopes.has(item.scope),
					);

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
								content: item.content!,
								scope: item.scope!,
								projectId: itemProjectId,
								category: item.category!,
							})
							.run();
					}

					if (hasGlobal) regenerateGlobalMemoryFile();
					if (hasProject && input.projectId) regenerateProjectMemoryFile(input.projectId);

					console.log("[memory] consolidate complete:", { categories: validItems.length });
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

				const settingsRow = localDb.select().from(settings).get();
				const apiKey =
					settingsRow?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					console.log("[memory] No API key configured, skipping");
					return { success: false, reason: "no_api_key" as const };
				}
				const baseUrl =
					settingsRow?.anthropicBaseUrl || "https://api.anthropic.com";
				const model =
					settingsRow?.anthropicModel || "deepseek-v4-flash";

				let projectId = input.projectId;
				let projectPath = input.projectPath;

				if (input.workspaceId && (!projectId || !projectPath)) {
					const relations = getWorkspaceWithRelations(input.workspaceId);
					if (relations?.project) {
						projectId = projectId || relations.project.id;
						projectPath = projectPath || relations.project.mainRepoPath;
					}
				}

				console.log("[memory] Reading session transcript:", { projectPath });
				const transcript = readLatestClaudeSession(projectPath);
				if (!transcript) {
					console.log("[memory] No recent transcript found (must be <30min old)");
					return { success: false, reason: "no_transcript" as const };
				}
				console.log(
					"[memory] Transcript found, length:",
					transcript.length,
					"- calling API with model:",
					model,
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
						if (!grouped.has(scope)) grouped.set(scope, new Map());
						const scopeMap = grouped.get(scope)!;
						if (!scopeMap.has(cat)) scopeMap.set(cat, []);
						scopeMap.get(cat)!.push(m.content);
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
					const response = await fetch(`${baseUrl}/v1/messages`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-api-key": apiKey,
							"anthropic-version": "2023-06-01",
							"User-Agent": "claude-cli/2.1.44 (external, sdk-cli)",
						},
						body: JSON.stringify({
							model,
							max_tokens: 4096,
							messages: [
								{
									role: "user",
									content: `You reorganize a memory system. You receive all existing memories and a new session transcript. Your job: produce a COMPLETE, reorganized set of memories. Each category should contain ONE consolidated bullet-point list. Merge duplicates, remove outdated info, and integrate any new observations from the transcript.

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
								},
							],
						}),
					});

					if (!response.ok) {
						const errBody = await response.text().catch(() => "");
						console.log(
							"[memory] API error:",
							response.status,
							errBody.slice(0, 200),
						);
						return { success: false, reason: "api_error" as const };
					}

					const data = (await response.json()) as {
						content: Array<{ type: string; text?: string }>;
					};
					const text = data.content
						?.find((c) => c.type === "text")
						?.text?.trim();

					if (!text) {
						return { success: false, reason: "empty_response" as const };
					}

					const jsonMatch = text.match(/\[[\s\S]*\]/);
					if (!jsonMatch) {
						console.log("[memory] No JSON array found in response:", text.slice(0, 300));
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

					const validScopes = new Set(["global", "project"]);
					const validItems = parsed.filter(
						(item) =>
							item.content &&
							typeof item.content === "string" &&
							item.category &&
							typeof item.category === "string" &&
							item.scope &&
							validScopes.has(item.scope),
					);

					if (validItems.length === 0) {
						console.log("[memory] No valid items after filtering");
						return { success: true, categories: 0 };
					}

					const hasGlobal = validItems.some((i) => i.scope === "global");
					const hasProject = validItems.some((i) => i.scope === "project");

					if (hasGlobal) {
						localDb
							.delete(memories)
							.where(eq(memories.scope, "global"))
							.run();
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
								content: item.content!,
								scope: item.scope!,
								projectId: itemProjectId,
								category: item.category!,
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
