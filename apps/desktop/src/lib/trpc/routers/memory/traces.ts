import { memoryEpisodes, memoryTraces } from "@superset/local-db";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const toolCallSchema = z.object({
	tool: z.string(),
	input: z.string(),
	output: z.string(),
});

export const createTracesRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						episodeId: z.string().optional(),
						projectId: z.string().optional(),
						startDate: z.number().optional(),
						endDate: z.number().optional(),
						limit: z.number().min(1).max(200).default(100),
						offset: z.number().min(0).default(0),
					})
					.optional(),
			)
			.query(({ input }) => {
				const conditions = [];

				if (input?.episodeId) {
					conditions.push(eq(memoryTraces.episodeId, input.episodeId));
				}
				if (input?.projectId) {
					conditions.push(eq(memoryTraces.projectId, input.projectId));
				}
				if (input?.startDate) {
					conditions.push(gte(memoryTraces.createdAt, input.startDate));
				}
				if (input?.endDate) {
					conditions.push(lte(memoryTraces.createdAt, input.endDate));
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;

				const items = localDb
					.select()
					.from(memoryTraces)
					.where(where)
					.orderBy(desc(memoryTraces.createdAt))
					.limit(input?.limit ?? 100)
					.offset(input?.offset ?? 0)
					.all();

				const total = localDb
					.select({ count: count() })
					.from(memoryTraces)
					.where(where)
					.get();

				return { items, total: total?.count ?? 0 };
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(memoryTraces)
					.where(eq(memoryTraces.id, input.id))
					.get();
			}),

		batchCreate: publicProcedure
			.input(
				z.object({
					episodeId: z.string(),
					projectId: z.string().optional(),
					traces: z.array(
						z.object({
							turnIndex: z.number(),
							userText: z.string().nullable().optional(),
							agentText: z.string().nullable().optional(),
							toolCalls: z.array(toolCallSchema).nullable().optional(),
							agentThinking: z.string().nullable().optional(),
							tags: z.array(z.string()).nullable().optional(),
							errorSignatures: z.array(z.string()).nullable().optional(),
						}),
					),
				}),
			)
			.mutation(({ input }) => {
				const results = localDb.transaction((tx) => {
					const inserted = [];
					for (const trace of input.traces) {
						const row = tx
							.insert(memoryTraces)
							.values({
								episodeId: input.episodeId,
								projectId: input.projectId ?? null,
								turnIndex: trace.turnIndex,
								userText: trace.userText ?? null,
								agentText: trace.agentText ?? null,
								toolCalls: trace.toolCalls ?? null,
								agentThinking: trace.agentThinking ?? null,
								tags: trace.tags ?? null,
								errorSignatures: trace.errorSignatures ?? null,
							})
							.returning()
							.get();
						inserted.push(row);
					}

					tx.update(memoryEpisodes)
						.set({
							traceCount: inserted.length,
							updatedAt: Date.now(),
						})
						.where(eq(memoryEpisodes.id, input.episodeId))
						.run();

					return inserted;
				});

				return results;
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					reflection: z.string().nullable().optional(),
					tags: z.array(z.string()).nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;
				return localDb
					.update(memoryTraces)
					.set(updates)
					.where(eq(memoryTraces.id, id))
					.returning()
					.get();
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb.delete(memoryTraces).where(eq(memoryTraces.id, input.id)).run();
				return { success: true };
			}),
	});
};
