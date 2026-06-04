import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import { electronTrpc } from "./trpc-react";
import { sessionIdLink } from "./session-id-link";
import { tauriLink } from "./tauri-link";

const links = [sessionIdLink(), tauriLink()];

/** tRPC React client for React hooks (used by ElectronTRPCProvider). */
export const electronReactClient = electronTrpc.createClient({ links });

/** tRPC proxy client for imperative calls from stores/utilities. */
export const electronTrpcClient = createTRPCProxyClient<AppRouter>({ links });
