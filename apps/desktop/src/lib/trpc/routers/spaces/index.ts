import { projects, spaces } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const colorSchema = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex like #RRGGBB");

export const createSpacesRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			return localDb.select().from(spaces).orderBy(asc(spaces.createdAt)).all();
		}),

		create: publicProcedure
			.input(
				z.object({
					name: z.string().trim().min(1).max(64),
					color: colorSchema,
				}),
			)
			.mutation(({ input }) => {
				return localDb
					.insert(spaces)
					.values({ name: input.name, color: input.color })
					.returning()
					.get();
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().trim().min(1).max(64).optional(),
						color: colorSchema.optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const space = localDb
					.select()
					.from(spaces)
					.where(eq(spaces.id, input.id))
					.get();
				if (!space) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Space ${input.id} not found`,
					});
				}
				localDb
					.update(spaces)
					.set({
						...(input.patch.name !== undefined && { name: input.patch.name }),
						...(input.patch.color !== undefined && {
							color: input.patch.color,
						}),
					})
					.where(eq(spaces.id, input.id))
					.run();
				return { success: true as const };
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const space = localDb
					.select()
					.from(spaces)
					.where(eq(spaces.id, input.id))
					.get();
				if (!space) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Space ${input.id} not found`,
					});
				}
				if (space.isDefault) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "The Default space cannot be deleted.",
					});
				}
				const projectCount = localDb
					.select({ count: sql<number>`count(*)` })
					.from(projects)
					.where(eq(projects.spaceId, input.id))
					.get();
				if ((projectCount?.count ?? 0) > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Move ${projectCount?.count} project(s) to another space before deleting.`,
					});
				}
				localDb.delete(spaces).where(eq(spaces.id, input.id)).run();
				return { success: true as const };
			}),

		getProjectCounts: publicProcedure.query(() => {
			const rows = localDb
				.select({
					spaceId: projects.spaceId,
					count: sql<number>`count(*)`,
				})
				.from(projects)
				.groupBy(projects.spaceId)
				.all();
			const counts: Record<string, number> = {};
			for (const row of rows) {
				if (row.spaceId) counts[row.spaceId] = Number(row.count);
			}
			return counts;
		}),
	});
};

export type SpacesRouter = ReturnType<typeof createSpacesRouter>;
