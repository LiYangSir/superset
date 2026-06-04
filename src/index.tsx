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
import { flushPendingSnapshots } from "./lib/trpc-storage";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

window.addEventListener("beforeunload", () => {
	flushPendingSnapshots();
});

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
	import("@tauri-apps/api/event").then(({ listen }) => {
		listen<string>("deep-link-navigate", (event) => {
			handleDeepLink(event.payload);
		});
	});
}

setupDeepLinkListener();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		cleanupBootErrorHandling();
	});
}

// Prevent accidental page reload in production (Cmd+R / Ctrl+R / F5)
if (!import.meta.hot) {
	document.addEventListener("keydown", (e) => {
		if (
			(e.key === "r" && (e.metaKey || e.ctrlKey)) ||
			e.key === "F5"
		) {
			e.preventDefault();
		}
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
