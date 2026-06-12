import { EventEmitter } from "node:events";
import {
	agentActivities,
	projects,
	type SelectAgentActivity,
} from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, gte, inArray, isNull, not } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { readLatestClaudeSession } from "../memory/session-reader";
import {
	getConfiguredAiCliAgent,
	runAiCliWithTempCwd,
	stripMarkdownFences,
} from "../utils/ai-cli";
import { getWorkspaceWithRelations } from "../workspaces/utils/db-helpers";

export interface ActivityUpdateEvent {
	type: "create" | "update" | "complete" | "archive";
	activityId: string;
	workspaceId: string;
	projectId: string | null;
}

const activityEmitter = new EventEmitter();
activityEmitter.setMaxListeners(0);

const ACTIVITY_UPDATE_EVENT = "activity-update";

function emitActivityUpdate(event: ActivityUpdateEvent) {
	activityEmitter.emit(ACTIVITY_UPDATE_EVENT, event);
}

function fingerprintTodo(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		hash = (hash * 31 + content.charCodeAt(i)) | 0;
	}
	return `t_${(hash >>> 0).toString(36)}`;
}

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

						emitActivityUpdate({
							type: "update",
							activityId: existing.id,
							workspaceId: existing.workspaceId,
							projectId: existing.projectId,
						});

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

				emitActivityUpdate({
					type: "create",
					activityId: row.id,
					workspaceId: row.workspaceId,
					projectId: row.projectId,
				});

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

				emitActivityUpdate({
					type: "complete",
					activityId: activity.id,
					workspaceId: activity.workspaceId,
					projectId: activity.projectId,
				});

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
				const existing = localDb
					.select()
					.from(agentActivities)
					.where(eq(agentActivities.id, input.id))
					.get() as SelectAgentActivity | undefined;
				if (!existing) {
					return { success: false, reason: "not_found" as const };
				}
				localDb
					.update(agentActivities)
					.set({ archivedAt: Date.now(), updatedAt: Date.now() })
					.where(eq(agentActivities.id, input.id))
					.run();
				emitActivityUpdate({
					type: "archive",
					activityId: existing.id,
					workspaceId: existing.workspaceId,
					projectId: existing.projectId,
				});
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
					conditions.push(eq(agentActivities.workspaceId, input.workspaceId));
				}
				if (input.projectId) {
					conditions.push(eq(agentActivities.projectId, input.projectId));
				}
				localDb
					.update(agentActivities)
					.set({ archivedAt: Date.now(), updatedAt: Date.now() })
					.where(and(...conditions))
					.run();
				emitActivityUpdate({
					type: "archive",
					activityId: "*",
					workspaceId: input.workspaceId ?? "*",
					projectId: input.projectId ?? null,
				});
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

		setStatus: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					workspaceId: z.string(),
					status: z.enum(["in_progress", "waiting_for_input"]),
				}),
			)
			.mutation(({ input }) => {
				const activity = localDb
					.select()
					.from(agentActivities)
					.where(
						and(
							eq(agentActivities.paneId, input.paneId),
							not(eq(agentActivities.status, "completed")),
							not(eq(agentActivities.status, "failed")),
						),
					)
					.orderBy(desc(agentActivities.startedAt))
					.get() as SelectAgentActivity | undefined;

				if (!activity) {
					return { success: false, reason: "no_active_activity" as const };
				}
				if (activity.status === input.status) {
					return { success: true };
				}

				localDb
					.update(agentActivities)
					.set({ status: input.status, updatedAt: Date.now() })
					.where(eq(agentActivities.id, activity.id))
					.run();

				emitActivityUpdate({
					type: "update",
					activityId: activity.id,
					workspaceId: activity.workspaceId,
					projectId: activity.projectId,
				});

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
					toolPhase: z.enum(["pre", "post", "post-failure"]).optional(),
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
				const phase = input.toolPhase ?? "post";
				const parsed = safeParseToolInput(input.toolInput);

				if (input.toolName === "TodoWrite" && phase === "post") {
					applyTodoWrite(metadata, parsed);
				} else if (input.toolName === "Task") {
					applyTaskTool(metadata, parsed, phase);
				} else if (phase === "post" || phase === "post-failure") {
					metadata.toolCount = (metadata.toolCount ?? 0) + 1;
					metadata.lastTool = input.toolName;
					if (phase === "post-failure") {
						metadata.lastFailure = {
							toolName: input.toolName,
							summary: summarizeToolInput(parsed, input.toolInput),
							at: Date.now(),
						};
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

				emitActivityUpdate({
					type: "update",
					activityId: activity.id,
					workspaceId: activity.workspaceId,
					projectId: activity.projectId,
				});

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
					return {
						success: false,
						reason: "no_activities" as const,
						report: null,
					};
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
					const result = await runAiCliWithTempCwd(
						`Based on the following agent activity records from the past week, generate a concise weekly work report (周报) in Chinese. Requirements:

1. Skip trivial or meaningless entries (e.g. "继续", "重试", "ok", "continue", single-word confirmations, retries, etc.)
2. Group by project, summarize key accomplishments, and highlight important changes
3. Merge similar or duplicate entries into one item
4. Use markdown format

Activity records:
${activitiesText}

Total activities: ${rows.length}

Generate the weekly report now. Use Chinese. Output markdown only, no extra commentary.`,
						{
							agent: getConfiguredAiCliAgent(),
							timeoutMs: 120_000,
						},
					);

					if (!result.ok) {
						return {
							success: false,
							reason: result.reason,
							report: null,
						};
					}

					return { success: true, report: stripMarkdownFences(result.text) };
				} catch {
					return { success: false, reason: "exception" as const, report: null };
				}
			}),

		subscribeUpdates: publicProcedure
			.input(
				z
					.object({
						workspaceId: z.string().optional(),
					})
					.optional(),
			)
			.subscription(({ input }) => {
				return observable<ActivityUpdateEvent>((emit) => {
					const handler = (event: ActivityUpdateEvent) => {
						if (
							input?.workspaceId &&
							event.workspaceId !== "*" &&
							event.workspaceId !== input.workspaceId
						) {
							return;
						}
						emit.next(event);
					};
					activityEmitter.on(ACTIVITY_UPDATE_EVENT, handler);
					return () => {
						activityEmitter.off(ACTIVITY_UPDATE_EVENT, handler);
					};
				});
			}),
	});
};

async function summarizeActivityAsync(activityId: string, workspaceId: string) {
	const relations = getWorkspaceWithRelations(workspaceId);
	const projectPath = relations?.project?.mainRepoPath;
	if (!projectPath) return;

	await doSummarize(activityId, projectPath);
}

async function doSummarize(activityId: string, projectPath: string) {
	const transcript = readLatestClaudeSession(projectPath);
	if (!transcript) {
		return { success: false, reason: "no_transcript" as const };
	}

	try {
		const result = await runAiCliWithTempCwd(
			`Summarize what the agent accomplished in this session in 1-2 concise sentences. Focus on the concrete outcome (what was built, fixed, or changed), not the process. Use the same language as the user messages in the transcript (if the user wrote in Chinese, respond in Chinese).

Session transcript:
${transcript}

Return ONLY the summary text, no JSON, no markdown.`,
			{
				agent: getConfiguredAiCliAgent(),
				timeoutMs: 60_000,
			},
		);

		if (!result.ok) {
			return { success: false, reason: result.reason };
		}

		const summary = stripMarkdownFences(result.text);
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
		status: "pending" | "in_progress" | "completed";
		description?: string;
	}>;
	subagents?: Array<{
		id: string;
		description?: string;
		subagentType?: string;
		status: "in_progress" | "completed" | "failed";
		startedAt: number;
		endedAt?: number;
	}>;
	activeTaskId?: string;
	toolCount?: number;
	lastTool?: string;
	lastFailure?: {
		toolName: string;
		summary: string;
		at: number;
	};
}

function parseMetadata(raw: string | null | undefined): ActivityMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as ActivityMetadata;
	} catch {
		return {};
	}
}

function safeParseToolInput(raw: string): unknown {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyTodoWrite(metadata: ActivityMetadata, parsed: unknown): void {
	if (!isRecord(parsed)) return;
	const todos = parsed.todos;
	if (!Array.isArray(todos)) return;

	const previousById = new Map(
		(metadata.tasks ?? []).map((task) => [task.id, task]),
	);

	const next: NonNullable<ActivityMetadata["tasks"]> = [];
	let activeTaskId: string | undefined;

	for (const raw of todos) {
		if (!isRecord(raw)) continue;
		const content =
			typeof raw.content === "string"
				? raw.content
				: typeof raw.activeForm === "string"
					? raw.activeForm
					: "";
		if (!content) continue;
		const id = fingerprintTodo(content);
		const status = normalizeTodoStatus(raw.status);
		const subject =
			typeof raw.activeForm === "string" && status === "in_progress"
				? raw.activeForm
				: content;
		const description =
			typeof raw.description === "string" ? raw.description : undefined;

		const previous = previousById.get(id);
		next.push({
			id,
			subject,
			status,
			description: description ?? previous?.description,
		});
		if (status === "in_progress" && !activeTaskId) {
			activeTaskId = id;
		}
	}

	metadata.tasks = next;
	metadata.activeTaskId = activeTaskId;
}

function normalizeTodoStatus(
	raw: unknown,
): "pending" | "in_progress" | "completed" {
	if (raw === "completed" || raw === "done") return "completed";
	if (raw === "in_progress" || raw === "active" || raw === "running") {
		return "in_progress";
	}
	return "pending";
}

function applyTaskTool(
	metadata: ActivityMetadata,
	parsed: unknown,
	phase: "pre" | "post" | "post-failure",
): void {
	if (!isRecord(parsed)) return;
	const description =
		typeof parsed.description === "string" ? parsed.description : undefined;
	const subagentType =
		typeof parsed.subagent_type === "string"
			? parsed.subagent_type
			: typeof parsed.subagentType === "string"
				? parsed.subagentType
				: undefined;
	if (!description && !subagentType) return;

	metadata.subagents = metadata.subagents ?? [];

	if (phase === "pre") {
		metadata.subagents.push({
			id: `sa_${Date.now()}_${metadata.subagents.length}`,
			description,
			subagentType,
			status: "in_progress",
			startedAt: Date.now(),
		});
		return;
	}

	const target = [...metadata.subagents]
		.reverse()
		.find(
			(sa) =>
				sa.status === "in_progress" &&
				sa.description === description &&
				(subagentType ? sa.subagentType === subagentType : true),
		);

	if (target) {
		target.status = phase === "post-failure" ? "failed" : "completed";
		target.endedAt = Date.now();
	} else {
		metadata.subagents.push({
			id: `sa_${Date.now()}_${metadata.subagents.length}`,
			description,
			subagentType,
			status: phase === "post-failure" ? "failed" : "completed",
			startedAt: Date.now(),
			endedAt: Date.now(),
		});
	}
}

function summarizeToolInput(parsed: unknown, raw: string): string {
	if (isRecord(parsed)) {
		const candidates = [
			parsed.command,
			parsed.cmd,
			parsed.path,
			parsed.file_path,
			parsed.pattern,
			parsed.query,
			parsed.url,
			parsed.description,
		];
		for (const c of candidates) {
			if (typeof c === "string" && c.length > 0) {
				return c.length > 200 ? `${c.slice(0, 200)}…` : c;
			}
		}
	}
	if (!raw) return "";
	return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
