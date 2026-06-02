import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { electronTrpc } from "./electron-trpc";
import { sessionIdLink } from "./session-id-link";
import { tauriLink } from "./tauri-link";

const links = [sessionIdLink(), tauriLink({ transformer: superjson })];

/** Tauri tRPC React client for React hooks (used by ElectronTRPCProvider). */
export const electronReactClient = electronTrpc.createClient({ links });

/** Tauri tRPC proxy client for imperative calls from stores/utilities. */
export const electronTrpcClient = createTRPCProxyClient<AppRouter>({ links });
