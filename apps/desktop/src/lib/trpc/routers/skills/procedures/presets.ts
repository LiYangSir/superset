import { skillPresetSkills, skillPresets, skills } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { publicProcedure } from "../../..";

export function createPresetsProcedures() {
	return {
		list: publicProcedure.query(() => {
			const presets = localDb
				.select()
				.from(skillPresets)
				.orderBy(asc(skillPresets.sortOrder))
				.all();

			const counts = localDb
				.select({
					presetId: skillPresetSkills.presetId,
					count: sql<number>`COUNT(*)`,
				})
				.from(skillPresetSkills)
				.groupBy(skillPresetSkills.presetId)
				.all();

			const countMap = new Map(counts.map((c) => [c.presetId, c.count]));

			return presets.map((preset) => ({
				...preset,
				skillCount: countMap.get(preset.id) ?? 0,
			}));
		}),

		getActive: publicProcedure.query(() => {
			const preset = localDb
				.select()
				.from(skillPresets)
				.where(eq(skillPresets.isActive, true))
				.get();

			if (!preset) return null;

			const presetSkills = localDb
				.select({
					skillId: skillPresetSkills.skillId,
					sortOrder: skillPresetSkills.sortOrder,
					name: skills.name,
				})
				.from(skillPresetSkills)
				.innerJoin(skills, eq(skillPresetSkills.skillId, skills.id))
				.where(eq(skillPresetSkills.presetId, preset.id))
				.orderBy(asc(skillPresetSkills.sortOrder))
				.all();

			return { ...preset, skills: presetSkills };
		}),

		create: publicProcedure
			.input(
				z.object({
					name: z.string().trim().min(1),
					description: z.string().optional(),
					icon: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const maxOrder = localDb
					.select({
						max: sql<number>`COALESCE(MAX(sort_order), -1)`,
					})
					.from(skillPresets)
					.get();

				const id = uuidv4();
				const now = Date.now();

				return localDb
					.insert(skillPresets)
					.values({
						id,
						name: input.name,
						description: input.description ?? null,
						icon: input.icon ?? null,
						sortOrder: (maxOrder?.max ?? -1) + 1,
						createdAt: now,
						updatedAt: now,
					})
					.returning()
					.get();
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					name: z.string().trim().min(1).optional(),
					description: z.string().nullable().optional(),
					icon: z.string().nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(skillPresets)
					.where(eq(skillPresets.id, input.id))
					.get();

				if (!existing) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Preset ${input.id} not found`,
					});
				}

				const updateData: Record<string, unknown> = {
					updatedAt: Date.now(),
				};

				if (input.name !== undefined) updateData.name = input.name;
				if (input.description !== undefined)
					updateData.description = input.description;
				if (input.icon !== undefined) updateData.icon = input.icon;

				localDb
					.update(skillPresets)
					.set(updateData)
					.where(eq(skillPresets.id, input.id))
					.run();

				const updated = localDb
					.select()
					.from(skillPresets)
					.where(eq(skillPresets.id, input.id))
					.get();
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Preset ${input.id} not found after update`,
					});
				}
				return updated;
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb.delete(skillPresets).where(eq(skillPresets.id, input.id)).run();
				return { success: true as const };
			}),

		addSkill: publicProcedure
			.input(
				z.object({
					presetId: z.string(),
					skillId: z.string(),
				}),
			)
			.mutation(({ input }) => {
				const maxOrder = localDb
					.select({
						max: sql<number>`COALESCE(MAX(sort_order), -1)`,
					})
					.from(skillPresetSkills)
					.where(eq(skillPresetSkills.presetId, input.presetId))
					.get();

				localDb
					.insert(skillPresetSkills)
					.values({
						presetId: input.presetId,
						skillId: input.skillId,
						sortOrder: (maxOrder?.max ?? -1) + 1,
					})
					.run();

				localDb
					.update(skillPresets)
					.set({ updatedAt: Date.now() })
					.where(eq(skillPresets.id, input.presetId))
					.run();

				return { success: true as const };
			}),

		removeSkill: publicProcedure
			.input(
				z.object({
					presetId: z.string(),
					skillId: z.string(),
				}),
			)
			.mutation(({ input }) => {
				localDb.run(
					sql`DELETE FROM skill_preset_skills WHERE preset_id = ${input.presetId} AND skill_id = ${input.skillId}`,
				);

				localDb
					.update(skillPresets)
					.set({ updatedAt: Date.now() })
					.where(eq(skillPresets.id, input.presetId))
					.run();

				return { success: true as const };
			}),

		reorder: publicProcedure
			.input(z.object({ order: z.array(z.string()) }))
			.mutation(({ input }) => {
				for (let i = 0; i < input.order.length; i++) {
					localDb
						.update(skillPresets)
						.set({ sortOrder: i })
						.where(eq(skillPresets.id, input.order[i]))
						.run();
				}
				return { success: true as const };
			}),
	};
}
