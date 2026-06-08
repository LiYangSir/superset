import { memoryWorldModels } from "@superset/local-db";
import { and, count, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { syncCognitiveMemoryToFiles } from "./sync";

const modelTypeEnum = z.enum(["environment", "inference", "constraint"]);
const statusEnum = z.enum(["active", "archived"]);

export const createWorldModelsRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().optional(),
						scope: z.enum(["global", "project"]).optional(),
						modelType: modelTypeEnum.optional(),
						status: statusEnum.optional(),
						limit: z.number().min(1).max(200).default(100),
						offset: z.number().min(0).default(0),
					})
					.optional(),
			)
			.query(({ input }) => {
				const conditions = [];

				if (input?.projectId) {
					conditions.push(
						or(
							eq(memoryWorldModels.scope, "global"),
							eq(memoryWorldModels.projectId, input.projectId),
						),
					);
				}
				if (input?.scope) {
					conditions.push(eq(memoryWorldModels.scope, input.scope));
				}
				if (input?.modelType) {
					conditions.push(eq(memoryWorldModels.modelType, input.modelType));
				}
				if (input?.status) {
					conditions.push(eq(memoryWorldModels.status, input.status));
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;

				const items = localDb
					.select()
					.from(memoryWorldModels)
					.where(where)
					.orderBy(desc(memoryWorldModels.confidence))
					.limit(input?.limit ?? 100)
					.offset(input?.offset ?? 0)
					.all();

				const total = localDb
					.select({ count: count() })
					.from(memoryWorldModels)
					.where(where)
					.get();

				return { items, total: total?.count ?? 0 };
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(memoryWorldModels)
					.where(eq(memoryWorldModels.id, input.id))
					.get();
			}),

		create: publicProcedure
			.input(
				z.object({
					projectId: z.string().optional(),
					modelType: modelTypeEnum,
					content: z.string().min(1),
					confidence: z.number().min(0).max(1).default(0.5),
					domainTags: z.array(z.string()).optional(),
					scope: z.enum(["global", "project"]).default("global"),
				}),
			)
			.mutation(({ input }) => {
				const result = localDb
					.insert(memoryWorldModels)
					.values({
						projectId: input.projectId ?? null,
						modelType: input.modelType,
						content: input.content,
						confidence: input.confidence,
						domainTags: input.domainTags ?? null,
						scope: input.scope,
					})
					.returning()
					.get();

				syncCognitiveMemoryToFiles(input.projectId);
				return result;
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					content: z.string().min(1).optional(),
					modelType: modelTypeEnum.optional(),
					confidence: z.number().min(0).max(1).optional(),
					domainTags: z.array(z.string()).nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;
				const result = localDb
					.update(memoryWorldModels)
					.set({ ...updates, updatedAt: Date.now() })
					.where(eq(memoryWorldModels.id, id))
					.returning()
					.get();

				if (result) {
					syncCognitiveMemoryToFiles(result.projectId ?? undefined);
				}
				return result;
			}),

		archive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const result = localDb
					.update(memoryWorldModels)
					.set({ status: "archived", updatedAt: Date.now() })
					.where(eq(memoryWorldModels.id, input.id))
					.returning()
					.get();

				if (result) {
					syncCognitiveMemoryToFiles(result.projectId ?? undefined);
				}
				return result;
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(memoryWorldModels)
					.where(eq(memoryWorldModels.id, input.id))
					.get();

				localDb
					.delete(memoryWorldModels)
					.where(eq(memoryWorldModels.id, input.id))
					.run();

				if (existing) {
					syncCognitiveMemoryToFiles(existing.projectId ?? undefined);
				}
				return { success: true };
			}),
	});
};
