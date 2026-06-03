import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { electronTrpc } from "./electron-trpc";
import { sessionIdLink } from "./session-id-link";

const isTauri =
	typeof window !== "undefined" &&
	!!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

const transportLink = isTauri
	? (await import("./tauri-link")).tauriLink()
	: (await import("trpc-electron/renderer")).ipcLink({
			transformer: superjson,
		});

const links = [sessionIdLink(), transportLink];

/** tRPC React client for React hooks (used by ElectronTRPCProvider). */
export const electronReactClient = electronTrpc.createClient({ links });

/** tRPC proxy client for imperative calls from stores/utilities. */
export const electronTrpcClient = createTRPCProxyClient<AppRouter>({ links });
