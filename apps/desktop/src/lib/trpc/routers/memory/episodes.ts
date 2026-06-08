import { memoryEpisodes, memoryTraces } from "@superset/local-db";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createEpisodesRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().optional(),
						status: z.enum(["open", "finalized"]).optional(),
						startDate: z.number().optional(),
						endDate: z.number().optional(),
						limit: z.number().min(1).max(100).default(50),
						offset: z.number().min(0).default(0),
					})
					.optional(),
			)
			.query(({ input }) => {
				const conditions = [];

				if (input?.projectId) {
					conditions.push(eq(memoryEpisodes.projectId, input.projectId));
				}
				if (input?.status) {
					conditions.push(eq(memoryEpisodes.status, input.status));
				}
				if (input?.startDate) {
					conditions.push(gte(memoryEpisodes.createdAt, input.startDate));
				}
				if (input?.endDate) {
					conditions.push(lte(memoryEpisodes.createdAt, input.endDate));
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;

				const items = localDb
					.select()
					.from(memoryEpisodes)
					.where(where)
					.orderBy(desc(memoryEpisodes.createdAt))
					.limit(input?.limit ?? 50)
					.offset(input?.offset ?? 0)
					.all();

				const total = localDb
					.select({ count: count() })
					.from(memoryEpisodes)
					.where(where)
					.get();

				return { items, total: total?.count ?? 0 };
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const episode = localDb
					.select()
					.from(memoryEpisodes)
					.where(eq(memoryEpisodes.id, input.id))
					.get();

				if (!episode) return null;

				const traces = localDb
					.select()
					.from(memoryTraces)
					.where(eq(memoryTraces.episodeId, input.id))
					.orderBy(memoryTraces.turnIndex)
					.all();

				return { ...episode, traces };
			}),

		create: publicProcedure
			.input(
				z.object({
					projectId: z.string().optional(),
					workspaceId: z.string().optional(),
					agentActivityId: z.string().optional(),
					title: z.string(),
					summary: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				return localDb
					.insert(memoryEpisodes)
					.values({
						projectId: input.projectId ?? null,
						workspaceId: input.workspaceId ?? null,
						agentActivityId: input.agentActivityId ?? null,
						title: input.title,
						summary: input.summary ?? null,
						status: "open",
					})
					.returning()
					.get();
			}),

		finalize: publicProcedure
			.input(z.object({ id: z.string(), summary: z.string().optional() }))
			.mutation(({ input }) => {
				return localDb
					.update(memoryEpisodes)
					.set({
						status: "finalized",
						summary: input.summary,
						updatedAt: Date.now(),
					})
					.where(eq(memoryEpisodes.id, input.id))
					.returning()
					.get();
			}),

		updateScore: publicProcedure
			.input(
				z.object({
					id: z.string(),
					rHuman: z.number().min(0).max(1),
					rGoalAchievement: z.number().min(-1).max(1).optional(),
					rProcessQuality: z.number().min(-1).max(1).optional(),
					rUserSatisfaction: z.number().min(-1).max(1).optional(),
				}),
			)
			.mutation(({ input }) => {
				return localDb
					.update(memoryEpisodes)
					.set({
						rHuman: input.rHuman,
						rGoalAchievement: input.rGoalAchievement,
						rProcessQuality: input.rProcessQuality,
						rUserSatisfaction: input.rUserSatisfaction,
						updatedAt: Date.now(),
					})
					.where(eq(memoryEpisodes.id, input.id))
					.returning()
					.get();
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb
					.delete(memoryEpisodes)
					.where(eq(memoryEpisodes.id, input.id))
					.run();
				return { success: true };
			}),
	});
};
