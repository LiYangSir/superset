import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { defineConfig } from "vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";

const host = process.env.TAURI_DEV_HOST;
const DEV_SERVER_PORT = Number(process.env.DESKTOP_VITE_PORT) || 5173;

export default defineConfig({
	define: {
		"process.env.NODE_ENV": JSON.stringify(
			process.env.NODE_ENV ?? "development",
		),
		"process.platform": JSON.stringify(process.platform),
		"import.meta.env.DEV_SERVER_PORT": JSON.stringify(String(DEV_SERVER_PORT)),
		"process.env.DESKTOP_VITE_PORT": JSON.stringify(
			process.env.DESKTOP_VITE_PORT,
		),
		"process.env.DESKTOP_NOTIFICATIONS_PORT": JSON.stringify(
			process.env.DESKTOP_NOTIFICATIONS_PORT,
		),
		"process.env.SUPERSET_WORKSPACE_NAME": JSON.stringify(
			process.env.SUPERSET_WORKSPACE_NAME,
		),
		__IS_TAURI__: JSON.stringify(true),
	},

	server: {
		port: DEV_SERVER_PORT,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: DEV_SERVER_PORT + 1 } : undefined,
	},

	plugins: [
		tanstackRouter({
			target: "react",
			routesDirectory: resolve("src/renderer/routes"),
			generatedRouteTree: resolve("src/renderer/routeTree.gen.ts"),
			indexToken: "page",
			routeToken: "layout",
			autoCodeSplitting: true,
			routeFileIgnorePattern:
				"^(?!(__root|page|layout)\\.tsx$).*\\.(tsx?|jsx?)$",
		}),
		tsconfigPathsPlugin({
			projects: [resolve("tsconfig.json")],
		}),
		tailwindcss(),
		codeInspectorPlugin({
			bundler: "vite",
			hotKeys: ["altKey"],
			hideConsole: true,
			port: Number(process.env.CODE_INSPECTOR_PORT) || undefined,
		}),
		reactPlugin(),
	],

	resolve: {
		alias: {
			"renderer/lib/trpc-client": resolve("src/renderer/lib/trpc-client.tauri.ts"),
		},
	},

	worker: {
		format: "es" as const,
	},

	publicDir: resolve("src/resources/public"),

	root: resolve("src/renderer"),

	build: {
		sourcemap: true,
		outDir: resolve("dist/renderer"),
		emptyOutDir: true,

		rollupOptions: {
			input: {
				index: resolve("src/renderer/index.html"),
			},

			onwarn(warning, defaultHandler) {
				if (
					warning.code === "MODULE_LEVEL_DIRECTIVE" &&
					warning.message.includes("use client")
				) {
					return;
				}
				defaultHandler(warning);
			},
		},
	},
});
