/**
 * Local-first stub of shared env. The cloud `@t3-oss/env-core` schema
 * was removed when we stripped multi-tenant configuration; the few
 * fields we still consume are sourced from process.env directly.
 */
import { getWorkspaceName as readWorkspaceName } from "./worktree-id";

export const env = {
	NODE_ENV: (process.env.NODE_ENV ?? "production") as
		| "development"
		| "production"
		| "test",
	SKIP_ENV_VALIDATION: true,
	DESKTOP_NOTIFICATIONS_PORT: process.env.DESKTOP_NOTIFICATIONS_PORT
		? Number(process.env.DESKTOP_NOTIFICATIONS_PORT)
		: undefined,
	DESKTOP_VITE_PORT: process.env.DESKTOP_VITE_PORT
		? Number(process.env.DESKTOP_VITE_PORT)
		: 5173,
};

export function getWorkspaceName(): string | undefined {
	return readWorkspaceName();
}
