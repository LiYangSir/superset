import {
	taskComments,
	taskLabels,
	taskSubtasks,
	tasks,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, like, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const taskPrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);
const taskStatusSchema = z.enum([
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
]);

let subtablesCreated = false;
function ensureTaskSubtablesExist() {
	if (subtablesCreated) return;
	try {
		localDb.run(sql`CREATE TABLE IF NOT EXISTS task_subtasks (
			id TEXT PRIMARY KEY,
			task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			done INTEGER NOT NULL DEFAULT 0,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS task_subtasks_task_id_idx ON task_subtasks(task_id)`,
		);
		localDb.run(sql`CREATE TABLE IF NOT EXISTS task_labels (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			organization_id TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS task_labels_org_id_idx ON task_labels(organization_id)`,
		);
		localDb.run(sql`CREATE TABLE IF NOT EXISTS task_comments (
			id TEXT PRIMARY KEY,
			task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			author TEXT NOT NULL,
			text TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments(task_id)`,
		);
		try {
			localDb.run(sql`ALTER TABLE tasks ADD COLUMN archived_at TEXT`);
		} catch {
			// column already exists
		}
		subtablesCreated = true;
	} catch {
		// ignore errors
	}
}

export const createTasksRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						organizationId: z.string().optional(),
						status: taskStatusSchema.optional(),
						priority: taskPrioritySchema.optional(),
						search: z.string().optional(),
					})
					.optional(),
			)
			.query(({ input }) => {
				ensureTaskSubtablesExist();
				const conditions = [
					isNull(tasks.deleted_at),
					isNull(tasks.archived_at),
				];

				if (input?.organizationId) {
					conditions.push(eq(tasks.organization_id, input.organizationId));
				}
				if (input?.status) {
					conditions.push(eq(tasks.status, input.status));
				}
				if (input?.priority) {
					conditions.push(eq(tasks.priority, input.priority));
				}
				if (input?.search) {
					conditions.push(like(tasks.title, `%${input.search}%`));
				}

				return localDb
					.select()
					.from(tasks)
					.where(and(...conditions))
					.orderBy(asc(tasks.status_position), desc(tasks.created_at))
					.all();
			}),

		subtaskCounts: publicProcedure.query(() => {
			ensureTaskSubtablesExist();
			try {
				const rows = localDb
					.select({
						taskId: taskSubtasks.taskId,
						total: sql<number>`COUNT(*)`,
						done: sql<number>`SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END)`,
					})
					.from(taskSubtasks)
					.groupBy(taskSubtasks.taskId)
					.all();
				return rows as { taskId: string; total: number; done: number }[];
			} catch {
				return [];
			}
		}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const task = localDb
					.select()
					.from(tasks)
					.where(eq(tasks.id, input.id))
					.get();

				if (!task) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Task ${input.id} not found`,
					});
				}

				ensureTaskSubtablesExist();

				let subtasks: Array<{
					id: string;
					taskId: string;
					title: string;
					done: boolean;
					sortOrder: number;
					createdAt: number;
				}> = [];
				let comments: Array<{
					id: string;
					taskId: string;
					author: string;
					text: string;
					createdAt: number;
				}> = [];

				try {
					subtasks = localDb
						.select()
						.from(taskSubtasks)
						.where(eq(taskSubtasks.taskId, input.id))
						.orderBy(asc(taskSubtasks.sortOrder))
						.all();
				} catch {
					// table may not exist yet
				}

				try {
					comments = localDb
						.select()
						.from(taskComments)
						.where(eq(taskComments.taskId, input.id))
						.orderBy(asc(taskComments.createdAt))
						.all();
				} catch {
					// table may not exist yet
				}

				return { ...task, subtasks, comments };
			}),

		create: publicProcedure
			.input(
				z.object({
					title: z.string().trim().min(1),
					description: z.string().optional(),
					status: taskStatusSchema.default("todo"),
					priority: taskPrioritySchema.default("none"),
					due_date: z.string().nullable().optional(),
					organization_id: z.string(),
					creator_id: z.string(),
					assignee_id: z.string().nullable().optional(),
					labels: z.array(z.string()).optional(),
				}),
			)
			.mutation(({ input }) => {
				const id = uuidv4();
				const now = new Date().toISOString();
				const slug = `TASK-${Date.now().toString(36).toUpperCase()}`;

				return localDb
					.insert(tasks)
					.values({
						id,
						slug,
						title: input.title,
						description: input.description ?? null,
						status: input.status,
						priority: input.priority,
						due_date: input.due_date ?? null,
						organization_id: input.organization_id,
						creator_id: input.creator_id,
						assignee_id: input.assignee_id ?? null,
						labels: input.labels ?? [],
						created_at: now,
						updated_at: now,
					})
					.returning()
					.get();
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						title: z.string().trim().min(1).optional(),
						description: z.string().nullable().optional(),
						status: taskStatusSchema.optional(),
						priority: taskPrioritySchema.optional(),
						due_date: z.string().nullable().optional(),
						assignee_id: z.string().nullable().optional(),
						labels: z.array(z.string()).optional(),
						status_position: z.number().optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const task = localDb
					.select()
					.from(tasks)
					.where(eq(tasks.id, input.id))
					.get();

				if (!task) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Task ${input.id} not found`,
					});
				}

				const now = new Date().toISOString();
				const updateData: Record<string, unknown> = {
					updated_at: now,
				};

				if (input.patch.title !== undefined)
					updateData.title = input.patch.title;
				if (input.patch.description !== undefined)
					updateData.description = input.patch.description;
				if (input.patch.status !== undefined) {
					updateData.status = input.patch.status;
					if (
						input.patch.status === "done" ||
						input.patch.status === "cancelled"
					) {
						updateData.completed_at = now;
					} else if (input.patch.status === "in_progress" && !task.started_at) {
						updateData.started_at = now;
					}
				}
				if (input.patch.priority !== undefined)
					updateData.priority = input.patch.priority;
				if (input.patch.due_date !== undefined)
					updateData.due_date = input.patch.due_date;
				if (input.patch.assignee_id !== undefined)
					updateData.assignee_id = input.patch.assignee_id;
				if (input.patch.labels !== undefined)
					updateData.labels = input.patch.labels;
				if (input.patch.status_position !== undefined)
					updateData.status_position = input.patch.status_position;

				localDb
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, input.id))
					.run();

				return localDb.select().from(tasks).where(eq(tasks.id, input.id)).get();
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const now = new Date().toISOString();
				localDb
					.update(tasks)
					.set({ deleted_at: now, updated_at: now })
					.where(eq(tasks.id, input.id))
					.run();
				return { success: true as const };
			}),

		archive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const now = new Date().toISOString();
				localDb
					.update(tasks)
					.set({ archived_at: now, updated_at: now })
					.where(eq(tasks.id, input.id))
					.run();
				return { success: true as const };
			}),

		unarchive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const now = new Date().toISOString();
				localDb
					.update(tasks)
					.set({ archived_at: null, updated_at: now })
					.where(eq(tasks.id, input.id))
					.run();
				return { success: true as const };
			}),

		listArchived: publicProcedure.query(() => {
			ensureTaskSubtablesExist();
			return localDb
				.select()
				.from(tasks)
				.where(and(isNull(tasks.deleted_at), sql`archived_at IS NOT NULL`))
				.orderBy(desc(tasks.updated_at))
				.all();
		}),

		reorder: publicProcedure
			.input(
				z.object({
					id: z.string(),
					status: taskStatusSchema,
					position: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const now = new Date().toISOString();
				const updateData: Record<string, unknown> = {
					status: input.status,
					status_position: input.position,
					updated_at: now,
				};

				const task = localDb
					.select()
					.from(tasks)
					.where(eq(tasks.id, input.id))
					.get();

				if (task) {
					if (
						(input.status === "done" || input.status === "cancelled") &&
						task.status !== "done" &&
						task.status !== "cancelled"
					) {
						updateData.completed_at = now;
					}
					if (input.status === "in_progress" && !task.started_at) {
						updateData.started_at = now;
					}
				}

				localDb
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, input.id))
					.run();
				return { success: true as const };
			}),

		// Subtask procedures
		subtasks: router({
			create: publicProcedure
				.input(
					z.object({
						taskId: z.string(),
						title: z.string().trim().min(1),
					}),
				)
				.mutation(({ input }) => {
					ensureTaskSubtablesExist();
					const maxOrder = localDb
						.select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
						.from(taskSubtasks)
						.where(eq(taskSubtasks.taskId, input.taskId))
						.get();

					return localDb
						.insert(taskSubtasks)
						.values({
							taskId: input.taskId,
							title: input.title,
							sortOrder: (maxOrder?.max ?? -1) + 1,
						})
						.returning()
						.get();
				}),

			toggle: publicProcedure
				.input(z.object({ id: z.string() }))
				.mutation(({ input }) => {
					const subtask = localDb
						.select()
						.from(taskSubtasks)
						.where(eq(taskSubtasks.id, input.id))
						.get();

					if (!subtask) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: `Subtask ${input.id} not found`,
						});
					}

					localDb
						.update(taskSubtasks)
						.set({ done: !subtask.done })
						.where(eq(taskSubtasks.id, input.id))
						.run();

					return { success: true as const };
				}),

			update: publicProcedure
				.input(
					z.object({
						id: z.string(),
						title: z.string().trim().min(1),
					}),
				)
				.mutation(({ input }) => {
					localDb
						.update(taskSubtasks)
						.set({ title: input.title })
						.where(eq(taskSubtasks.id, input.id))
						.run();
					return { success: true as const };
				}),

			delete: publicProcedure
				.input(z.object({ id: z.string() }))
				.mutation(({ input }) => {
					localDb
						.delete(taskSubtasks)
						.where(eq(taskSubtasks.id, input.id))
						.run();
					return { success: true as const };
				}),
		}),

		// Comment procedures
		comments: router({
			create: publicProcedure
				.input(
					z.object({
						taskId: z.string(),
						author: z.string(),
						text: z.string().trim().min(1),
					}),
				)
				.mutation(({ input }) => {
					ensureTaskSubtablesExist();
					return localDb
						.insert(taskComments)
						.values({
							taskId: input.taskId,
							author: input.author,
							text: input.text,
						})
						.returning()
						.get();
				}),
		}),

		// Label procedures
		labels: router({
			list: publicProcedure
				.input(z.object({ organizationId: z.string() }))
				.query(({ input }) => {
					ensureTaskSubtablesExist();
					try {
						return localDb
							.select()
							.from(taskLabels)
							.where(eq(taskLabels.organizationId, input.organizationId))
							.orderBy(asc(taskLabels.sortOrder))
							.all();
					} catch {
						return [];
					}
				}),

			create: publicProcedure
				.input(
					z.object({
						name: z.string().trim().min(1),
						color: z.string(),
						organizationId: z.string(),
					}),
				)
				.mutation(({ input }) => {
					ensureTaskSubtablesExist();
					const maxOrder = localDb
						.select({
							max: sql<number>`COALESCE(MAX(sort_order), -1)`,
						})
						.from(taskLabels)
						.where(eq(taskLabels.organizationId, input.organizationId))
						.get();

					return localDb
						.insert(taskLabels)
						.values({
							name: input.name,
							color: input.color,
							organizationId: input.organizationId,
							sortOrder: (maxOrder?.max ?? -1) + 1,
						})
						.returning()
						.get();
				}),

			update: publicProcedure
				.input(
					z.object({
						id: z.string(),
						name: z.string().trim().min(1).optional(),
						color: z.string().optional(),
					}),
				)
				.mutation(({ input }) => {
					const updateData: Record<string, string> = {};
					if (input.name !== undefined) updateData.name = input.name;
					if (input.color !== undefined) updateData.color = input.color;

					if (Object.keys(updateData).length > 0) {
						localDb
							.update(taskLabels)
							.set(updateData)
							.where(eq(taskLabels.id, input.id))
							.run();
					}

					return localDb
						.select()
						.from(taskLabels)
						.where(eq(taskLabels.id, input.id))
						.get();
				}),

			delete: publicProcedure
				.input(z.object({ id: z.string() }))
				.mutation(({ input }) => {
					localDb.delete(taskLabels).where(eq(taskLabels.id, input.id)).run();
					return { success: true as const };
				}),
		}),
	});
};

export type TasksRouter = ReturnType<typeof createTasksRouter>;
