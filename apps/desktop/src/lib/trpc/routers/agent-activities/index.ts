import {
	agentActivities,
	projects,
	type SelectAgentActivity,
	type SelectSettings,
	settings,
} from "@superset/local-db";
import { and, desc, eq, gte, inArray, isNull, not } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { readLatestClaudeSession } from "../memory/session-reader";
import { getWorkspaceWithRelations } from "../workspaces/utils/db-helpers";

export const createAgentActivitiesRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().optional(),
					branch: z.string().optional(),
					status: z.enum(["in_progress", "completed", "failed"]).optional(),
					paneId: z.string().optional(),
					includeArchived: z.boolean().default(false),
					limit: z.number().min(1).max(200).default(50),
				}),
			)
			.query(({ input }) => {
				const conditions = [];
				if (input.workspaceId) {
					conditions.push(eq(agentActivities.workspaceId, input.workspaceId));
				}
				if (input.branch) {
					conditions.push(eq(agentActivities.branch, input.branch));
				}
				if (input.status) {
					conditions.push(eq(agentActivities.status, input.status));
				}
				if (input.paneId) {
					conditions.push(eq(agentActivities.paneId, input.paneId));
				}
				if (!input.includeArchived) {
					conditions.push(isNull(agentActivities.archivedAt));
				}

				const results = localDb
					.select()
					.from(agentActivities)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(desc(agentActivities.startedAt))
					.limit(input.limit)
					.all();
				return results;
			}),

		listGlobal: publicProcedure
			.input(
				z.object({
					status: z.enum(["in_progress", "completed", "failed"]).optional(),
					projectId: z.string().optional(),
					includeArchived: z.boolean().default(false),
					limit: z.number().min(1).max(200).default(100),
				}),
			)
			.query(({ input }) => {
				const conditions = [];
				if (!input.includeArchived) {
					conditions.push(isNull(agentActivities.archivedAt));
				}
				if (input.status) {
					conditions.push(eq(agentActivities.status, input.status));
				}
				if (input.projectId) {
					conditions.push(eq(agentActivities.projectId, input.projectId));
				}

				return localDb
					.select({
						activity: agentActivities,
						projectName: projects.name,
						projectColor: projects.color,
					})
					.from(agentActivities)
					.leftJoin(projects, eq(agentActivities.projectId, projects.id))
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(desc(agentActivities.startedAt))
					.limit(input.limit)
					.all();
			}),

		create: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
					tabName: z.string().optional(),
					presetName: z.string().optional(),
					modelName: z.string().optional(),
					userMessage: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const relations = getWorkspaceWithRelations(input.workspaceId);
				if (!relations) {
					return { success: false, reason: "workspace_not_found" as const };
				}

				const { workspace, project } = relations;
				const branch = workspace.branch;
				const projectId = project?.id ?? workspace.projectId;

				if (input.paneId) {
					const existing = localDb
						.select()
						.from(agentActivities)
						.where(
							and(
								eq(agentActivities.paneId, input.paneId),
								eq(agentActivities.status, "in_progress"),
							),
						)
						.get() as SelectAgentActivity | undefined;

					if (existing) {
						const now = Date.now();
						localDb
							.update(agentActivities)
							.set({
								userMessage: input.userMessage ?? existing.userMessage,
								title: input.userMessage?.slice(0, 120) ?? existing.title,
								tabName: input.tabName ?? existing.tabName,
								updatedAt: now,
							})
							.where(eq(agentActivities.id, existing.id))
							.run();

						return {
							success: true,
							activity: { ...existing, updatedAt: now },
						};
					}
				}

				const now = Date.now();
				const row = localDb
					.insert(agentActivities)
					.values({
						workspaceId: input.workspaceId,
						projectId,
						tabId: input.tabId,
						paneId: input.paneId,
						tabName: input.tabName,
						presetName: input.presetName,
						modelName: input.modelName,
						branch,
						status: "in_progress",
						title: input.userMessage?.slice(0, 120),
						userMessage: input.userMessage,
						startedAt: now,
						createdAt: now,
						updatedAt: now,
					})
					.returning()
					.get();

				return { success: true, activity: row };
			}),

		complete: publicProcedure
			.input(
				z.object({
					id: z.string().optional(),
					paneId: z.string().optional(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				let activity: SelectAgentActivity | undefined;

				if (input.id) {
					activity = localDb
						.select()
						.from(agentActivities)
						.where(eq(agentActivities.id, input.id))
						.get() as SelectAgentActivity | undefined;
				} else if (input.paneId) {
					activity = localDb
						.select()
						.from(agentActivities)
						.where(
							and(
								eq(agentActivities.paneId, input.paneId),
								eq(agentActivities.status, "in_progress"),
							),
						)
						.orderBy(desc(agentActivities.startedAt))
						.get() as SelectAgentActivity | undefined;
				}

				if (!activity) {
					return { success: false, reason: "not_found" as const };
				}

				const now = Date.now();
				const durationMs = now - activity.startedAt;

				localDb
					.update(agentActivities)
					.set({
						status: "completed",
						endedAt: now,
						durationMs,
						updatedAt: now,
					})
					.where(eq(agentActivities.id, activity.id))
					.run();

				summarizeActivityAsync(
					activity.id,
					input.workspaceId ?? activity.workspaceId,
				).catch(() => {});

				return { success: true };
			}),

		summarize: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const activity = localDb
					.select()
					.from(agentActivities)
					.where(eq(agentActivities.id, input.id))
					.get() as SelectAgentActivity | undefined;
				if (!activity) {
					return { success: false, reason: "not_found" as const };
				}

				const relations = getWorkspaceWithRelations(activity.workspaceId);
				const projectPath = relations?.project?.mainRepoPath;
				if (!projectPath) {
					return {
						success: false,
						reason: "no_project_path" as const,
					};
				}

				return doSummarize(activity.id, projectPath);
			}),

		archive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(agentActivities)
					.set({ archivedAt: Date.now(), updatedAt: Date.now() })
					.where(eq(agentActivities.id, input.id))
					.run();
				return { success: true };
			}),

		archiveBatch: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().optional(),
					projectId: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const conditions = [
					not(eq(agentActivities.status, "in_progress")),
					isNull(agentActivities.archivedAt),
				];
				if (input.workspaceId) {
					conditions.push(
						eq(agentActivities.workspaceId, input.workspaceId),
					);
				}
				if (input.projectId) {
					conditions.push(eq(agentActivities.projectId, input.projectId));
				}
				localDb
					.update(agentActivities)
					.set({ archivedAt: Date.now(), updatedAt: Date.now() })
					.where(and(...conditions))
					.run();
				return { success: true };
			}),

		unarchive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(agentActivities)
					.set({ archivedAt: null, updatedAt: Date.now() })
					.where(eq(agentActivities.id, input.id))
					.run();
				return { success: true };
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb
					.delete(agentActivities)
					.where(eq(agentActivities.id, input.id))
					.run();
				return { success: true };
			}),

		clearBranch: publicProcedure
			.input(
				z.object({
					branch: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const conditions = [eq(agentActivities.branch, input.branch)];
				if (input.workspaceId) {
					conditions.push(eq(agentActivities.workspaceId, input.workspaceId));
				}
				localDb
					.delete(agentActivities)
					.where(and(...conditions))
					.run();
				return { success: true };
			}),

		updateMetadata: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					workspaceId: z.string(),
					toolName: z.string(),
					toolInput: z.string(),
				}),
			)
			.mutation(({ input }) => {
				const activity = localDb
					.select()
					.from(agentActivities)
					.where(
						and(
							eq(agentActivities.paneId, input.paneId),
							eq(agentActivities.status, "in_progress"),
						),
					)
					.orderBy(desc(agentActivities.startedAt))
					.get() as SelectAgentActivity | undefined;

				if (!activity) {
					return { success: false, reason: "no_active_activity" as const };
				}

				const metadata = parseMetadata(activity.metadata);

				if (input.toolName === "TaskCreate") {
					const result = safeParseToolResult(input.toolInput);
					if (result?.subject) {
						const task = {
							id: result.taskId || String(Date.now()),
							subject: result.subject,
							status: "pending" as const,
							description: result.description,
						};
						metadata.tasks = metadata.tasks || [];
						const existingIdx = metadata.tasks.findIndex(
							(t) => t.id === task.id,
						);
						if (existingIdx >= 0) {
							metadata.tasks[existingIdx] = task;
						} else {
							metadata.tasks.push(task);
						}
					}
				} else if (input.toolName === "TaskUpdate") {
					const result = safeParseToolResult(input.toolInput);
					if (result?.taskId && metadata.tasks) {
						const task = metadata.tasks.find((t) => t.id === result.taskId);
						if (task) {
							if (result.status) task.status = result.status;
							if (result.subject) task.subject = result.subject;
						}
					}
				} else if (input.toolName === "Agent") {
					const result = safeParseToolResult(input.toolInput);
					if (result?.description) {
						metadata.subagents = metadata.subagents || [];
						metadata.subagents.push({
							id: String(Date.now()),
							description: result.description,
							status: "in_progress",
							startedAt: Date.now(),
						});
					}
				}

				localDb
					.update(agentActivities)
					.set({
						metadata: JSON.stringify(metadata),
						updatedAt: Date.now(),
					})
					.where(eq(agentActivities.id, activity.id))
					.run();

				return { success: true };
			}),

		setProjectWeeklyReport: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					enabled: z.boolean(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.update(projects)
					.set({ weeklyReportEnabled: input.enabled })
					.where(eq(projects.id, input.projectId))
					.run();
				return { success: true };
			}),

		generateWeeklyReport: publicProcedure
			.input(z.object({}))
			.mutation(async () => {
				const settingsRow = localDb.select().from(settings).get() as
					| SelectSettings
					| undefined;
				const apiKey =
					settingsRow?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					return { success: false, reason: "no_api_key" as const, report: null };
				}

				const baseUrl =
					settingsRow?.anthropicBaseUrl || "https://api.anthropic.com";
				const model = settingsRow?.anthropicModel || "deepseek-v4-flash";

				const disabledProjects = localDb
					.select({ id: projects.id })
					.from(projects)
					.where(eq(projects.weeklyReportEnabled, false))
					.all()
					.map((p) => p.id);

				const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

				const conditions = [
					eq(agentActivities.status, "completed"),
					gte(agentActivities.startedAt, oneWeekAgo),
					isNull(agentActivities.archivedAt),
				];

				if (disabledProjects.length > 0) {
					conditions.push(
						not(inArray(agentActivities.projectId, disabledProjects)),
					);
				}

				const rows = localDb
					.select({
						summary: agentActivities.summary,
						userMessage: agentActivities.userMessage,
						title: agentActivities.title,
						branch: agentActivities.branch,
						durationMs: agentActivities.durationMs,
						startedAt: agentActivities.startedAt,
						projectId: agentActivities.projectId,
						projectName: projects.name,
					})
					.from(agentActivities)
					.leftJoin(projects, eq(agentActivities.projectId, projects.id))
					.where(and(...conditions))
					.orderBy(desc(agentActivities.startedAt))
					.all();

				if (rows.length === 0) {
					return { success: false, reason: "no_activities" as const, report: null };
				}

				const grouped = new Map<string, { name: string; items: string[] }>();
				for (const row of rows) {
					const key = row.projectId;
					const name = row.projectName || "Unknown Project";
					let group = grouped.get(key);
					if (!group) {
						group = { name, items: [] };
						grouped.set(key, group);
					}
					const desc = row.summary || row.userMessage || row.title || "";
					if (desc) {
						group.items.push(desc);
					}
				}

				let activitiesText = "";
				for (const [, group] of grouped) {
					activitiesText += `\n## ${group.name}\n`;
					for (const item of group.items) {
						activitiesText += `- ${item}\n`;
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
							max_tokens: 2048,
							messages: [
								{
									role: "user",
									content: `Based on the following agent activity records from the past week, generate a concise weekly work report (周报) in Chinese. Requirements:

1. Skip trivial or meaningless entries (e.g. "继续", "重试", "ok", "continue", single-word confirmations, retries, etc.)
2. Group by project, summarize key accomplishments, and highlight important changes
3. Merge similar or duplicate entries into one item
4. Use markdown format

Activity records:
${activitiesText}

Total activities: ${rows.length}

Generate the weekly report now. Use Chinese. Output markdown only, no extra commentary.`,
								},
							],
						}),
					});

					if (!response.ok) {
						return { success: false, reason: "api_error" as const, report: null };
					}

					const data = (await response.json()) as {
						content: Array<{ type: string; text?: string }>;
					};
					const report = data.content
						?.find((c) => c.type === "text")
						?.text?.trim();

					if (!report) {
						return {
							success: false,
							reason: "empty_response" as const,
							report: null,
						};
					}

					return { success: true, report };
				} catch {
					return { success: false, reason: "exception" as const, report: null };
				}
			}),
	});
};

async function summarizeActivityAsync(activityId: string, workspaceId: string) {
	const settingsRow = localDb.select().from(settings).get() as
		| SelectSettings
		| undefined;
	const apiKey = settingsRow?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
	if (!apiKey) return;

	const relations = getWorkspaceWithRelations(workspaceId);
	const projectPath = relations?.project?.mainRepoPath;
	if (!projectPath) return;

	await doSummarize(activityId, projectPath);
}

async function doSummarize(activityId: string, projectPath: string) {
	const settingsRow = localDb.select().from(settings).get() as
		| SelectSettings
		| undefined;
	const apiKey = settingsRow?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return { success: false, reason: "no_api_key" as const };
	}

	const baseUrl = settingsRow?.anthropicBaseUrl || "https://api.anthropic.com";
	const model = settingsRow?.anthropicModel || "deepseek-v4-flash";

	const transcript = readLatestClaudeSession(projectPath);
	if (!transcript) {
		return { success: false, reason: "no_transcript" as const };
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
				max_tokens: 256,
				messages: [
					{
						role: "user",
						content: `Summarize what the agent accomplished in this session in 1-2 concise sentences. Focus on the concrete outcome (what was built, fixed, or changed), not the process. Use the same language as the user messages in the transcript (if the user wrote in Chinese, respond in Chinese).

Session transcript:
${transcript}

Return ONLY the summary text, no JSON, no markdown.`,
					},
				],
			}),
		});

		if (!response.ok) {
			return { success: false, reason: "api_error" as const };
		}

		const data = (await response.json()) as {
			content: Array<{ type: string; text?: string }>;
		};
		const summary = data.content?.find((c) => c.type === "text")?.text?.trim();

		if (!summary) {
			return { success: false, reason: "empty_response" as const };
		}

		localDb
			.update(agentActivities)
			.set({ summary, updatedAt: Date.now() })
			.where(eq(agentActivities.id, activityId))
			.run();

		return { success: true, summary };
	} catch (error) {
		console.error("[agent-activities] summarize error:", error);
		return { success: false, reason: "exception" as const };
	}
}

interface ActivityMetadata {
	tasks?: Array<{
		id: string;
		subject: string;
		status: string;
		description?: string;
	}>;
	subagents?: Array<{
		id: string;
		description?: string;
		status: string;
		startedAt: number;
		endedAt?: number;
	}>;
}

function parseMetadata(raw: string | null | undefined): ActivityMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as ActivityMetadata;
	} catch {
		return {};
	}
}

function safeParseToolResult(
	raw: string,
): Record<string, string | undefined> | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
