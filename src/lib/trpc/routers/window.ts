import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { publicProcedure, router } from "..";

export const createWindowRouter = () => {
	return router({
		minimize: publicProcedure.mutation(async () => {
			const window = getCurrentWindow();
			await window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(async () => {
			const window = getCurrentWindow();
			if (await window.isMaximized()) {
				await window.unmaximize();
			} else {
				await window.maximize();
			}
			return { success: true, isMaximized: await window.isMaximized() };
		}),

		close: publicProcedure.mutation(async () => {
			const window = getCurrentWindow();
			await window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(async () => {
			const window = getCurrentWindow();
			return await window.isMaximized();
		}),

		getPlatform: publicProcedure.query(() => {
			return process.platform;
		}),

		getHomeDir: publicProcedure.query(() => {
			return homedir();
		}),

		selectDirectory: publicProcedure
			.input(
				z
					.object({
						title: z.string().optional(),
						defaultPath: z.string().optional(),
					})
					.optional(),
			)
			.mutation(async ({ input }) => {
				const selected = await openDialog({
					directory: true,
					title: input?.title ?? "Select Directory",
					defaultPath: input?.defaultPath ?? undefined,
				});

				if (!selected) {
					return { canceled: true, path: null };
				}

				return { canceled: false, path: selected };
			}),

		selectImageFile: publicProcedure.mutation(async () => {
			const selected = await openDialog({
				title: "Select Organization Logo",
				filters: [
					{
						name: "Images",
						extensions: ["png", "jpg", "jpeg", "webp"],
					},
				],
			});

			if (!selected) {
				return { canceled: true, dataUrl: null };
			}

			const filePath = selected;
			const buffer = await fs.readFile(filePath);
			const ext = path.extname(filePath).slice(1).toLowerCase();
			const mimeType = ext === "jpg" ? "jpeg" : ext;
			const base64 = buffer.toString("base64");
			const dataUrl = `data:image/${mimeType};base64,${base64}`;

			return { canceled: false, dataUrl };
		}),
	});
};

export type WindowRouter = ReturnType<typeof createWindowRouter>;
