import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { persistentHistory } from "./lib/persistent-hash-history";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	context: {
		queryClient: electronQueryClient,
	},
});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};

function setupDeepLinkListener() {
	// Tauri mode
	if (window.__TAURI_INTERNALS__) {
		import("@tauri-apps/api/event").then(({ listen }) => {
			listen<string>("deep-link-navigate", (event) => {
				handleDeepLink(event.payload);
			});
		});
		return;
	}

	// Electron mode
	const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
	if (ipcRenderer) {
		ipcRenderer.on("deep-link-navigate", handleDeepLink);
	} else {
		reportBootError(
			"Renderer preload not available (window.ipcRenderer missing)",
		);
	}
}

setupDeepLinkListener();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
		if (ipcRenderer) {
			ipcRenderer.off("deep-link-navigate", handleDeepLink);
		}
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<RouterProvider router={router} />
		</BootErrorBoundary>,
	);
	markBootMounted();
}
