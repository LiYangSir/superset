import { memorySkills } from "@superset/local-db";
import { and, count, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { syncCognitiveMemoryToFiles } from "./sync";

const statusEnum = z.enum(["candidate", "active", "archived"]);

const procedureStepSchema = z.object({
	step: z.number(),
	action: z.string(),
	detail: z.string(),
});

export const createCognitiveSkillsRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().optional(),
						scope: z.enum(["global", "project"]).optional(),
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
							eq(memorySkills.scope, "global"),
							eq(memorySkills.projectId, input.projectId),
						),
					);
				}
				if (input?.scope) {
					conditions.push(eq(memorySkills.scope, input.scope));
				}
				if (input?.status) {
					conditions.push(eq(memorySkills.status, input.status));
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;

				const items = localDb
					.select()
					.from(memorySkills)
					.where(where)
					.orderBy(desc(memorySkills.eta))
					.limit(input?.limit ?? 100)
					.offset(input?.offset ?? 0)
					.all();

				const total = localDb
					.select({ count: count() })
					.from(memorySkills)
					.where(where)
					.get();

				return { items, total: total?.count ?? 0 };
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(memorySkills)
					.where(eq(memorySkills.id, input.id))
					.get();
			}),

		create: publicProcedure
			.input(
				z.object({
					projectId: z.string().optional(),
					name: z.string().min(1),
					invocationGuide: z.string().min(1),
					procedureJson: z.array(procedureStepSchema).optional(),
					scope: z.enum(["global", "project"]).default("global"),
					status: statusEnum.default("candidate"),
				}),
			)
			.mutation(({ input }) => {
				const result = localDb
					.insert(memorySkills)
					.values({
						projectId: input.projectId ?? null,
						name: input.name,
						invocationGuide: input.invocationGuide,
						procedureJson: input.procedureJson ?? null,
						scope: input.scope,
						status: input.status,
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
					name: z.string().min(1).optional(),
					invocationGuide: z.string().min(1).optional(),
					procedureJson: z.array(procedureStepSchema).nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;
				const result = localDb
					.update(memorySkills)
					.set({ ...updates, updatedAt: Date.now() })
					.where(eq(memorySkills.id, id))
					.returning()
					.get();

				if (result) {
					syncCognitiveMemoryToFiles(result.projectId ?? undefined);
				}
				return result;
			}),

		promote: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const result = localDb
					.update(memorySkills)
					.set({ status: "active", updatedAt: Date.now() })
					.where(eq(memorySkills.id, input.id))
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
					.update(memorySkills)
					.set({ status: "archived", updatedAt: Date.now() })
					.where(eq(memorySkills.id, input.id))
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
					.from(memorySkills)
					.where(eq(memorySkills.id, input.id))
					.get();

				localDb.delete(memorySkills).where(eq(memorySkills.id, input.id)).run();

				if (existing) {
					syncCognitiveMemoryToFiles(existing.projectId ?? undefined);
				}
				return { success: true };
			}),
	});
};
