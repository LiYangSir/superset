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

function getSupersetHomeDir(): string {
	return (
		process.env.SUPERSET_HOME_DIR || path.join(os.homedir(), SUPERSET_DIR_NAME)
	);
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
		return;
	}

	writeMemoryFile(
		filePath,
		formatMemoriesAsMarkdown("Superset Memory (Global)", globalMemories),
	);
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
		return;
	}

	writeMemoryFile(
		filePath,
		formatMemoriesAsMarkdown(`Superset Memory (${project.name})`, projectMemories),
	);
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

				const memoriesToInclude = existingMemories.slice(0, 50);
				let existingMemoriesSection = "";
				if (memoriesToInclude.length > 0) {
					const globalMems = memoriesToInclude.filter(
						(m) => m.scope === "global",
					);
					const projectMems = memoriesToInclude.filter(
						(m) => m.scope === "project",
					);

					const sections: string[] = [];
					if (globalMems.length > 0) {
						sections.push("User Profile (global):");
						for (const m of globalMems) {
							sections.push(
								`  - [id: ${m.id}] (${m.category || "General"}): ${m.content}`,
							);
						}
					}
					if (projectMems.length > 0) {
						sections.push("Project-specific:");
						for (const m of projectMems) {
							sections.push(
								`  - [id: ${m.id}] (${m.category || "General"}): ${m.content}`,
							);
						}
					}
					existingMemoriesSection = `\n\nExisting memories (do NOT duplicate these):\n${sections.join("\n")}\n`;
				}

				try {
					const response = await fetch(`${baseUrl}/v1/messages`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-api-key": apiKey,
							"anthropic-version": "2023-06-01",
						},
						body: JSON.stringify({
							model,
							max_tokens: 2048,
							messages: [
								{
									role: "user",
									content: `You analyze coding session transcripts and manage a memory system. Extract observations that would be useful for future sessions.

There are two scopes of memory:
- "global": User profile — personal coding habits, preferred tools, communication style, expertise areas, general preferences. These travel across ALL projects.
- "project": Project-specific — tech stack choices, architecture decisions, naming conventions, requirements, patterns unique to this project.

When in doubt, prefer "global" for anything about the USER (who they are, how they work) and "project" for anything about the CODEBASE (how it's built, what it requires).
${existingMemoriesSection}
For each observation, decide the appropriate action:
- "create": New observation not covered by any existing memory
- "update": An existing memory should be refined, corrected, or expanded (provide "existingId")
- "delete": An existing memory is outdated, wrong, or superseded (provide "existingId")

Return a JSON array. Each object must have:
- "action": one of "create", "update", "delete"
- "content": the memory text (1-2 sentences). Required for "create" and "update".
- "scope": one of "global", "project". Required for "create". Determines where the memory is stored.
- "category": a human-readable label like "Coding Style", "Requirements", "Preferences", "Patterns", "Tools & Environment", or another fitting label. Required for "create", optional for "update".
- "existingId": the id of the existing memory to update or delete. Required for "update" and "delete".

Rules:
- Do NOT create a memory if an existing one already covers the same thing.
- Prefer "update" over "create"+"delete" when refining an observation.
- User profile changes (e.g. preferred language, expertise, habits) MUST use scope "global".
- Only include genuinely useful observations. Return [] if nothing noteworthy.

Session transcript:
${transcript}`,
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
						action?: "create" | "update" | "delete";
						content?: string;
						category?: string;
						scope?: "global" | "project";
						existingId?: string;
					}>;

					console.log("[memory] Parsed items:", JSON.stringify(parsed));

					if (!Array.isArray(parsed) || parsed.length === 0) {
						console.log("[memory] No memories extracted from session");
						return { success: true, created: 0, updated: 0, deleted: 0 };
					}

					const existingIds = new Set(existingMemories.map((m) => m.id));
					const validActions = new Set(["create", "update", "delete"]);
					const validScopes = new Set(["global", "project"]);

					const validItems = parsed.filter((item) => {
						const action = item.action || "create";
						if (!validActions.has(action)) return false;
						if (
							action === "create" &&
							(!item.content || typeof item.content !== "string")
						)
							return false;
						if (
							action === "update" &&
							(!item.existingId ||
								!existingIds.has(item.existingId) ||
								!item.content)
						)
							return false;
						if (
							action === "delete" &&
							(!item.existingId || !existingIds.has(item.existingId))
						)
							return false;
						return true;
					});

					let created = 0;
					let updated = 0;
					let deleted = 0;
					let touchedGlobal = false;
					let touchedProject = false;

					for (const item of validItems) {
						const action = item.action || "create";
						switch (action) {
							case "create": {
								const itemScope =
									item.scope && validScopes.has(item.scope)
										? item.scope
										: "global";
								const itemProjectId =
									itemScope === "project" ? projectId || null : null;
								localDb
									.insert(memories)
									.values({
										content: item.content!,
										scope: itemScope,
										projectId: itemProjectId,
										category: item.category || null,
									})
									.run();
								if (itemScope === "global") touchedGlobal = true;
								else touchedProject = true;
								created++;
								break;
							}
							case "update": {
								const existing = existingMemories.find(
									(m) => m.id === item.existingId,
								);
								localDb
									.update(memories)
									.set({
										content: item.content!,
										...(item.category !== undefined
											? { category: item.category }
											: {}),
										updatedAt: Date.now(),
									})
									.where(eq(memories.id, item.existingId!))
									.run();
								if (existing?.scope === "global") touchedGlobal = true;
								else touchedProject = true;
								updated++;
								break;
							}
							case "delete": {
								const existing = existingMemories.find(
									(m) => m.id === item.existingId,
								);
								localDb
									.delete(memories)
									.where(eq(memories.id, item.existingId!))
									.run();
								if (existing?.scope === "global") touchedGlobal = true;
								else touchedProject = true;
								deleted++;
								break;
							}
						}
					}

					if (touchedGlobal) {
						regenerateGlobalMemoryFile();
					}
					if (touchedProject && projectId) {
						regenerateProjectMemoryFile(projectId);
					}

					console.log("[memory] summarizeSession complete:", {
						created,
						updated,
						deleted,
					});
					return { success: true, created, updated, deleted };
				} catch (error) {
					console.error("[memory] Summarization failed:", error);
					return { success: false, reason: "exception" as const };
				}
			}),
	});
};
