import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { memories, projects } from "@superset/local-db";
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

function regenerateGlobalMemoryFile() {
	const globalMemories = localDb
		.select()
		.from(memories)
		.where(eq(memories.scope, "global"))
		.orderBy(desc(memories.updatedAt))
		.all();

	if (globalMemories.length === 0) {
		const filePath = path.join(getSupersetHomeDir(), "memory.md");
		try {
			fs.unlinkSync(filePath);
		} catch {
			// File may not exist
		}
		return;
	}

	const lines = ["# Superset Memory (Global)", ""];
	for (const mem of globalMemories) {
		if (mem.category) {
			lines.push(`## ${mem.category}`);
		}
		lines.push(mem.content);
		lines.push("");
	}

	const dir = getSupersetHomeDir();
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, "memory.md");
	const tmpPath = `${filePath}.tmp`;
	fs.writeFileSync(tmpPath, lines.join("\n"));
	fs.renameSync(tmpPath, filePath);
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

	const supersetDir = path.join(project.mainRepoPath, ".superset");

	if (projectMemories.length === 0) {
		try {
			fs.unlinkSync(path.join(supersetDir, "memory.md"));
		} catch {
			// File may not exist
		}
		return;
	}

	const lines = [`# Superset Memory (${project.name})`, ""];
	for (const mem of projectMemories) {
		if (mem.category) {
			lines.push(`## ${mem.category}`);
		}
		lines.push(mem.content);
		lines.push("");
	}

	fs.mkdirSync(supersetDir, { recursive: true });
	const filePath = path.join(supersetDir, "memory.md");
	const tmpPath = `${filePath}.tmp`;
	fs.writeFileSync(tmpPath, lines.join("\n"));
	fs.renameSync(tmpPath, filePath);
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

				const lines: string[] = [];

				if (globalMems.length > 0) {
					lines.push("# Global Memory");
					for (const mem of globalMems) {
						lines.push(`- ${mem.content}`);
					}
					lines.push("");
				}

				if (projectMems.length > 0) {
					lines.push("# Project Memory");
					for (const mem of projectMems) {
						lines.push(`- ${mem.content}`);
					}
					lines.push("");
				}

				return lines.join("\n");
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
				const apiKey = process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					return { success: false, reason: "no_api_key" as const };
				}

				let projectId = input.projectId;
				let projectPath = input.projectPath;

				if (input.workspaceId && (!projectId || !projectPath)) {
					const relations = getWorkspaceWithRelations(input.workspaceId);
					if (relations?.project) {
						projectId = projectId || relations.project.id;
						projectPath = projectPath || relations.project.mainRepoPath;
					}
				}

				const transcript = readLatestClaudeSession(projectPath);
				if (!transcript) {
					return { success: false, reason: "no_transcript" as const };
				}

				try {
					const response = await fetch(
						"https://api.anthropic.com/v1/messages",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"x-api-key": apiKey,
								"anthropic-version": "2023-06-01",
							},
							body: JSON.stringify({
								model: "claude-sonnet-4-5-20250514",
								max_tokens: 1024,
								messages: [
									{
										role: "user",
										content: `Analyze this coding session transcript and extract memory-worthy observations about the user's coding habits, preferences, requirements, or patterns. Only extract things that would be useful to remember for future sessions.

Return a JSON array of memory objects. Each object should have:
- "content": a concise description of the observation (1-2 sentences)
- "category": one of "coding-style", "requirements", "preferences", "patterns", "tools"

Only include genuinely useful observations. If nothing noteworthy, return an empty array [].

Session transcript:
${transcript}`,
									},
								],
							}),
						},
					);

					if (!response.ok) {
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
						return { success: false, reason: "no_json" as const };
					}

					const parsed = JSON.parse(jsonMatch[0]) as Array<{
						content: string;
						category: string;
					}>;

					if (!Array.isArray(parsed) || parsed.length === 0) {
						return { success: true, count: 0 };
					}

					const scope = projectId ? "project" : "global";
					let count = 0;

					for (const item of parsed) {
						if (!item.content || typeof item.content !== "string") continue;

						localDb
							.insert(memories)
							.values({
								content: item.content,
								scope,
								projectId: projectId || null,
								category: item.category || null,
							})
							.run();
						count++;
					}

					if (count > 0) {
						regenerateGlobalMemoryFile();
						if (projectId) {
							regenerateProjectMemoryFile(projectId);
						}
					}

					return { success: true, count };
				} catch (error) {
					console.error("[memory] Summarization failed:", error);
					return { success: false, reason: "exception" as const };
				}
			}),
	});
};
