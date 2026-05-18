/**
 * Local-first stub of main-process env. Replaces the deleted
 * `@t3-oss/env-core` schema. Only the values still used by main
 * code paths are exposed here.
 */
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
	ELECTRON_REACT_DEVTOOLS_PATH: process.env.ELECTRON_REACT_DEVTOOLS_PATH,
};
