/**
 * Local-first stub of renderer env. The cloud-side fields
 * (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ELECTRIC_URL, etc.) are
 * deliberately empty strings so that any remaining call sites
 * fail loudly when invoked instead of silently hitting prod.
 */
export const env = {
	NODE_ENV: (import.meta.env?.MODE ?? "production") as
		| "development"
		| "production"
		| "test",
	SKIP_ENV_VALIDATION: true,
	NEXT_PUBLIC_API_URL: "",
	NEXT_PUBLIC_ELECTRIC_URL: "",
	NEXT_PUBLIC_DOCS_URL: "",
};
