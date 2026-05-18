// Local-first stub: analytics removed. `track(...)` is a no-op.

type Properties = Record<string, unknown> | undefined;

export function track(_event: string, _properties?: Properties): void {}
