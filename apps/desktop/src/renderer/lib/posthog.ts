// Local-first stub: analytics removed from desktop. Keeps the
// `posthog.capture(...)` and related call sites compiling as no-ops.

type Properties = Record<string, unknown> | undefined;

export const posthog = {
	capture: (_event: string, _properties?: Properties) => {},
	identify: (_id: string, _properties?: Properties) => {},
	reset: () => {},
	reloadFeatureFlags: () => {},
	opt_in_capturing: () => {},
	opt_out_capturing: () => {},
	isFeatureEnabled: (_flag: string) => false,
	getFeatureFlag: (_flag: string) => false,
	onFeatureFlags: (_cb: (flags: string[]) => void) => () => {},
};
