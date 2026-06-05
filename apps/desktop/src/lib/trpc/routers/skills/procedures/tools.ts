import { skillSettings } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure } from "../../..";
import {
	type CustomToolDef,
	getAllAdapters,
	getDefaultAdapters,
	getSkillsDir,
	isToolInstalled,
	type SkillSettingsAccessor,
	type ToolCategory,
	type ToolInfo,
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

function setSetting(key: string, value: string | null): void {
	const existing = localDb
		.select()
		.from(skillSettings)
		.where(eq(skillSettings.key, key))
		.get();

	if (existing) {
		localDb
			.update(skillSettings)
			.set({ value })
			.where(eq(skillSettings.key, key))
			.run();
	} else {
		localDb.insert(skillSettings).values({ key, value }).run();
	}
}

export function createToolsProcedures() {
	return {
		getStatus: publicProcedure.query(() => {
			const settings = getSettingsAccessor();
			const adapters = getAllAdapters(settings);

			const tools: ToolInfo[] = adapters.map((adapter) => {
				const installed = isToolInstalled(adapter);
				const disabledKey = `tool_disabled_${adapter.key}`;
				const disabled = settings.getSetting(disabledKey) === "true";

				return {
					key: adapter.key,
					displayName: adapter.displayName,
					installed,
					skillsDir: getSkillsDir(adapter),
					enabled: !disabled,
					isCustom: adapter.isCustom,
					hasPathOverride: adapter.overrideSkillsDir !== null,
					projectRelativeSkillsDir:
						adapter.projectRelativeSkillsDir ?? adapter.relativeSkillsDir,
					hasProjectPathOverride: adapter.projectRelativeSkillsDir !== null,
					category: adapter.category,
				};
			});

			return tools;
		}),

		setEnabled: publicProcedure
			.input(
				z.object({
					key: z.string(),
					enabled: z.boolean(),
				}),
			)
			.mutation(({ input }) => {
				const settingKey = `tool_disabled_${input.key}`;
				setSetting(settingKey, input.enabled ? null : "true");
				return { success: true as const };
			}),

		setAllEnabled: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				const adapters = getDefaultAdapters();
				for (const adapter of adapters) {
					const settingKey = `tool_disabled_${adapter.key}`;
					setSetting(settingKey, input.enabled ? null : "true");
				}
				return { success: true as const };
			}),

		getOrder: publicProcedure.query(() => {
			const settings = getSettingsAccessor();
			const orderJson = settings.getSetting("tool_order");
			if (!orderJson) return [];
			try {
				return JSON.parse(orderJson) as string[];
			} catch {
				return [];
			}
		}),

		setOrder: publicProcedure
			.input(z.object({ order: z.array(z.string()) }))
			.mutation(({ input }) => {
				setSetting("tool_order", JSON.stringify(input.order));
				return { success: true as const };
			}),

		addCustomTool: publicProcedure
			.input(
				z.object({
					key: z.string(),
					displayName: z.string(),
					skillsDir: z.string(),
					category: z.enum(["coding", "lobster"]).optional().default("coding"),
				}),
			)
			.mutation(({ input }) => {
				const settings = getSettingsAccessor();
				const existing = settings.getSetting("custom_tools");
				let customTools: CustomToolDef[] = [];

				if (existing) {
					try {
						customTools = JSON.parse(existing);
					} catch {
						// reset if invalid
					}
				}

				const alreadyExists = customTools.some((t) => t.key === input.key);
				if (alreadyExists) {
					customTools = customTools.map((t) =>
						t.key === input.key
							? {
									...t,
									displayName: input.displayName,
									skillsDir: input.skillsDir,
									category: input.category as ToolCategory,
								}
							: t,
					);
				} else {
					customTools.push({
						key: input.key,
						displayName: input.displayName,
						skillsDir: input.skillsDir,
						projectRelativeSkillsDir: null,
						category: input.category as ToolCategory,
					});
				}

				setSetting("custom_tools", JSON.stringify(customTools));
				return { success: true as const };
			}),

		removeCustomTool: publicProcedure
			.input(z.object({ key: z.string() }))
			.mutation(({ input }) => {
				const settings = getSettingsAccessor();
				const existing = settings.getSetting("custom_tools");
				if (!existing) return { success: true as const };

				try {
					let customTools: CustomToolDef[] = JSON.parse(existing);
					customTools = customTools.filter((t) => t.key !== input.key);
					setSetting("custom_tools", JSON.stringify(customTools));
				} catch {
					// invalid JSON, clear it
					setSetting("custom_tools", "[]");
				}

				return { success: true as const };
			}),
	};
}
