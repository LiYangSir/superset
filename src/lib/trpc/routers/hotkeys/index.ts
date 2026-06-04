import { readFile, writeFile } from "node:fs/promises";
import {
	open as openDialog,
	save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { appState } from "main/lib/app-state";
import {
	buildHotkeysStateFromExport,
	createHotkeysExport,
	getCurrentPlatform,
	getHotkeysSummary,
	type HotkeysExportFile,
	type HotkeysState,
	normalizeBindingsWithDefaults,
} from "shared/hotkeys";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const hotkeysExportSchema = z.object({
	schemaVersion: z.number(),
	exportedAt: z.string(),
	app: z.string(),
	hotkeys: z
		.object({
			darwin: z.record(z.string(), z.string().nullable()).optional(),
			win32: z.record(z.string(), z.string().nullable()).optional(),
			linux: z.record(z.string(), z.string().nullable()).optional(),
		})
		.optional(),
});

export type HotkeysImportResult =
	| { canceled: true }
	| {
			canceled: false;
			path: string;
			state: HotkeysState;
			summary: { assigned: number; disabled: number };
			raw: HotkeysExportFile;
	  }
	| { canceled: false; error: string };

type HotkeysExportResult =
	| { canceled: true }
	| { canceled: false; path: string }
	| { canceled: false; error: string };

export const createHotkeysRouter = () => {
	return router({
		export: publicProcedure.mutation(async (): Promise<HotkeysExportResult> => {
			const filePath = await saveDialog({
				title: "Export Keyboard Shortcuts",
				defaultPath: "superset-hotkeys.json",
				filters: [{ name: "JSON", extensions: ["json"] }],
			});

			if (!filePath) {
				return { canceled: true };
			}

			const exportFile = createHotkeysExport(appState.data.hotkeysState);
			try {
				await writeFile(
					filePath,
					JSON.stringify(exportFile, null, 2),
					"utf-8",
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to write file";
				return { canceled: false, error: message };
			}

			return { canceled: false, path: filePath };
		}),

		import: publicProcedure.mutation(async (): Promise<HotkeysImportResult> => {
			const selected = await openDialog({
				title: "Import Keyboard Shortcuts",
				filters: [{ name: "JSON", extensions: ["json"] }],
			});

			if (!selected) {
				return { canceled: true };
			}

			const filePath = selected;

			try {
				const raw = await readFile(filePath, "utf-8");
				const parsed = hotkeysExportSchema.parse(JSON.parse(raw));
				const exportFile: HotkeysExportFile = {
					schemaVersion: parsed.schemaVersion,
					exportedAt: parsed.exportedAt,
					app: parsed.app,
					hotkeys: {
						darwin: parsed.hotkeys?.darwin ?? {},
						win32: parsed.hotkeys?.win32 ?? {},
						linux: parsed.hotkeys?.linux ?? {},
					},
				};

				const state = buildHotkeysStateFromExport(exportFile);
				const platform = getCurrentPlatform();
				const bindings = normalizeBindingsWithDefaults(
					exportFile.hotkeys?.[platform] ?? {},
					platform,
				);
				const summary = getHotkeysSummary(bindings);

				return {
					canceled: false,
					path: filePath,
					state,
					summary,
					raw: exportFile,
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Invalid hotkeys file";
				return { canceled: false, error: message };
			}
		}),
	});
};
