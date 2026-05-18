import { createTRPCReact } from "@trpc/react-query";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "./routers";

/**
 * Core tRPC initialization for the local Electron app.
 */
const t = initTRPC.create({
	transformer: superjson,
	isServer: true,
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;
export const trpc = createTRPCReact<AppRouter>();
