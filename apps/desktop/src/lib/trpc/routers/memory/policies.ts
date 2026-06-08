import { memoryPolicies } from "@superset/local-db";
import { and, count, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { syncCognitiveMemoryToFiles } from "./sync";

const experienceTypeEnum = z.enum([
	"success_pattern",
	"failure_avoidance",
	"preference",
	"workflow",
	"style",
]);

const statusEnum = z.enum(["candidate", "active", "archived"]);

export const createPoliciesRouter = () => {
	return router({
		list: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().optional(),
						scope: z.enum(["global", "project"]).optional(),
						status: statusEnum.optional(),
						experienceType: experienceTypeEnum.optional(),
						category: z.string().optional(),
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
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, input.projectId),
						),
					);
				}
				if (input?.scope) {
					conditions.push(eq(memoryPolicies.scope, input.scope));
				}
				if (input?.status) {
					conditions.push(eq(memoryPolicies.status, input.status));
				}
				if (input?.experienceType) {
					conditions.push(
						eq(memoryPolicies.experienceType, input.experienceType),
					);
				}
				if (input?.category) {
					conditions.push(eq(memoryPolicies.category, input.category));
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;

				const items = localDb
					.select()
					.from(memoryPolicies)
					.where(where)
					.orderBy(desc(memoryPolicies.support), desc(memoryPolicies.updatedAt))
					.limit(input?.limit ?? 100)
					.offset(input?.offset ?? 0)
					.all();

				const total = localDb
					.select({ count: count() })
					.from(memoryPolicies)
					.where(where)
					.get();

				return { items, total: total?.count ?? 0 };
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(memoryPolicies)
					.where(eq(memoryPolicies.id, input.id))
					.get();
			}),

		create: publicProcedure
			.input(
				z.object({
					projectId: z.string().optional(),
					trigger: z.string().min(1),
					procedure: z.string().min(1),
					verification: z.string().optional(),
					boundary: z.string().optional(),
					experienceType: experienceTypeEnum.default("preference"),
					status: statusEnum.default("active"),
					scope: z.enum(["global", "project"]).default("global"),
					category: z.string().optional(),
					support: z.number().optional(),
				}),
			)
			.mutation(({ input }) => {
				const result = localDb
					.insert(memoryPolicies)
					.values({
						projectId: input.projectId ?? null,
						trigger: input.trigger,
						procedure: input.procedure,
						verification: input.verification ?? null,
						boundary: input.boundary ?? null,
						experienceType: input.experienceType,
						status: input.status,
						scope: input.scope,
						category: input.category ?? null,
						support: input.support ?? 1,
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
					trigger: z.string().min(1).optional(),
					procedure: z.string().min(1).optional(),
					verification: z.string().nullable().optional(),
					boundary: z.string().nullable().optional(),
					experienceType: experienceTypeEnum.optional(),
					category: z.string().nullable().optional(),
					decisionGuidance: z.string().nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;
				const result = localDb
					.update(memoryPolicies)
					.set({ ...updates, updatedAt: Date.now() })
					.where(eq(memoryPolicies.id, id))
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
					.update(memoryPolicies)
					.set({ status: "active", updatedAt: Date.now() })
					.where(eq(memoryPolicies.id, input.id))
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
					.update(memoryPolicies)
					.set({ status: "archived", updatedAt: Date.now() })
					.where(eq(memoryPolicies.id, input.id))
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
					.from(memoryPolicies)
					.where(eq(memoryPolicies.id, input.id))
					.get();

				localDb
					.delete(memoryPolicies)
					.where(eq(memoryPolicies.id, input.id))
					.run();

				if (existing) {
					syncCognitiveMemoryToFiles(existing.projectId ?? undefined);
				}
				return { success: true };
			}),
	});
};
