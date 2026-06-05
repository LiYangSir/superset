import path from "node:path";
import {
	skillPresetToolToggles,
	skillSettings,
	skills,
	skillTargets,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { publicProcedure } from "../../..";
import { hashDirectory } from "../utils/content-hash";
import { removeTarget, syncSkill, targetDirName } from "../utils/sync-engine";
import {
	findAdapterWithSettings,
	getAllAdapters,
	getSkillsDir,
	type SkillSettingsAccessor,
} from "../utils/tool-adapters";

function getSettingsAccessor(): SkillSettingsAccessor {
	return {
		getSetting(key: string): string | null {
			try {
				const row = localDb
					.select()
					.from(skillSettings)
					.where(eq(skillSettings.key, key))
					.get();
				return row?.value ?? null;
			} catch {
				return null;
			}
		},
	};
}

export function createSyncProcedures() {
	return {
		syncToTool: publicProcedure
			.input(
				z.object({
					skillId: z.string(),
					tool: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const skill = localDb
					.select()
					.from(skills)
					.where(eq(skills.id, input.skillId))
					.get();

				if (!skill) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Skill ${input.skillId} not found`,
					});
				}

				const settings = getSettingsAccessor();
				const adapter = findAdapterWithSettings(settings, input.tool);
				if (!adapter) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Unknown tool: ${input.tool}`,
					});
				}

				const skillsDir = getSkillsDir(adapter);
				const dirName = targetDirName(skill.centralPath, skill.name);
				const targetPath = path.join(skillsDir, dirName);

				const result = await syncSkill(
					skill.centralPath,
					targetPath,
					"symlink",
				);

				if (!result.success) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: result.error ?? "Sync failed",
					});
				}

				const existing = localDb
					.select()
					.from(skillTargets)
					.where(
						and(
							eq(skillTargets.skillId, input.skillId),
							eq(skillTargets.tool, input.tool),
						),
					)
					.get();

				const sourceHash = await hashDirectory(skill.centralPath);

				if (existing) {
					localDb
						.update(skillTargets)
						.set({
							targetPath: result.targetPath,
							mode: result.mode,
							status: "synced",
							syncedAt: Date.now(),
							sourceHash,
							lastError: null,
						})
						.where(eq(skillTargets.id, existing.id))
						.run();
				} else {
					localDb
						.insert(skillTargets)
						.values({
							id: uuidv4(),
							skillId: input.skillId,
							tool: input.tool,
							targetPath: result.targetPath,
							mode: result.mode,
							status: "synced",
							syncedAt: Date.now(),
							sourceHash,
						})
						.run();
				}

				return { success: true as const, targetPath: result.targetPath };
			}),

		unsyncFromTool: publicProcedure
			.input(
				z.object({
					skillId: z.string(),
					tool: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const target = localDb
					.select()
					.from(skillTargets)
					.where(
						and(
							eq(skillTargets.skillId, input.skillId),
							eq(skillTargets.tool, input.tool),
						),
					)
					.get();

				if (target) {
					try {
						await removeTarget(target.targetPath);
					} catch {
						// best effort
					}
					localDb
						.delete(skillTargets)
						.where(eq(skillTargets.id, target.id))
						.run();
				}

				return { success: true as const };
			}),

		getToolToggles: publicProcedure
			.input(
				z.object({
					skillId: z.string(),
					presetId: z.string().optional(),
				}),
			)
			.query(({ input }) => {
				if (!input.presetId) {
					const targets = localDb
						.select()
						.from(skillTargets)
						.where(eq(skillTargets.skillId, input.skillId))
						.all();

					const settings = getSettingsAccessor();
					const adapters = getAllAdapters(settings);

					return adapters.map((adapter) => {
						const target = targets.find((t) => t.tool === adapter.key);
						return {
							tool: adapter.key,
							displayName: adapter.displayName,
							enabled: target?.status === "synced",
						};
					});
				}

				const toggles = localDb
					.select()
					.from(skillPresetToolToggles)
					.where(
						and(
							eq(skillPresetToolToggles.presetId, input.presetId),
							eq(skillPresetToolToggles.skillId, input.skillId),
						),
					)
					.all();

				const settings = getSettingsAccessor();
				const adapters = getAllAdapters(settings);

				return adapters.map((adapter) => {
					const toggle = toggles.find((t) => t.tool === adapter.key);
					return {
						tool: adapter.key,
						displayName: adapter.displayName,
						enabled: toggle?.enabled ?? true,
					};
				});
			}),

		setToolToggle: publicProcedure
			.input(
				z.object({
					skillId: z.string(),
					tool: z.string(),
					presetId: z.string(),
					enabled: z.boolean(),
				}),
			)
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(skillPresetToolToggles)
					.where(
						and(
							eq(skillPresetToolToggles.presetId, input.presetId),
							eq(skillPresetToolToggles.skillId, input.skillId),
							eq(skillPresetToolToggles.tool, input.tool),
						),
					)
					.get();

				if (existing) {
					localDb
						.update(skillPresetToolToggles)
						.set({ enabled: input.enabled })
						.where(
							and(
								eq(skillPresetToolToggles.presetId, input.presetId),
								eq(skillPresetToolToggles.skillId, input.skillId),
								eq(skillPresetToolToggles.tool, input.tool),
							),
						)
						.run();
				} else {
					localDb
						.insert(skillPresetToolToggles)
						.values({
							presetId: input.presetId,
							skillId: input.skillId,
							tool: input.tool,
							enabled: input.enabled,
						})
						.run();
				}

				return { success: true as const };
			}),
	};
}
