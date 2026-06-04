import type { TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import type { DataTransformer } from "@trpc/server/unstable-core-do-not-import";

declare global {
	interface Window {
		__TAURI_INTERNALS__?: unknown;
	}
}

async function tauriInvoke(cmd: string, args: Record<string, unknown>) {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke(cmd, args);
}

async function tauriListen(
	event: string,
	handler: (payload: unknown) => void,
): Promise<() => void> {
	const { listen } = await import("@tauri-apps/api/event");
	const unlisten = await listen(event, (e) => handler(e.payload));
	return unlisten;
}

interface NormalizedTransformer {
	serialize: (v: unknown) => unknown;
	deserialize: (v: unknown) => unknown;
}

function normalizeTransformer(
	t: DataTransformer | undefined,
	dir: "input" | "output",
): NormalizedTransformer {
	if (!t) return { serialize: (v) => v, deserialize: (v) => v };
	if ("input" in t && t.input) {
		return dir === "input"
			? (t as { input: NormalizedTransformer }).input
			: (t as { output: NormalizedTransformer }).output;
	}
	return t as NormalizedTransformer;
}

interface TauriLinkOptions {
	transformer?: DataTransformer;
}

export function tauriLink<TRouter extends AnyRouter>(
	opts?: TauriLinkOptions,
): TRPCLink<TRouter> {
	const transformer = opts?.transformer;

	return () => {
		return ({ op, next: _next }) => {
			return observable((observer) => {
				const { type, path, input } = op;

				if (type === "subscription") {
					return handleSubscription(path, input, transformer, observer);
				}

				handleQueryOrMutation(type, path, input, transformer, observer);

				return undefined;
			});
		};
	};
}

function handleQueryOrMutation(
	type: string,
	path: string,
	input: unknown,
	transformer: DataTransformer | undefined,
	observer: {
		next: (value: { result: { data: unknown } }) => void;
		error: (err: Error) => void;
		complete: () => void;
	},
) {
	const inp = normalizeTransformer(transformer, "input");
	const out = normalizeTransformer(transformer, "output");
	const serializedInput = inp.serialize(input);

	tauriInvoke("trpc_call", {
		path,
		type,
		input: serializedInput ?? null,
	})
		.then((result) => {
			const data = out.deserialize(result);
			observer.next({ result: { data } });
			observer.complete();
		})
		.catch((err) => {
			observer.error(
				new Error(typeof err === "string" ? err : JSON.stringify(err)),
			);
		});
}

function handleSubscription(
	path: string,
	input: unknown,
	transformer: DataTransformer | undefined,
	observer: {
		next: (value: { result: { data: unknown } }) => void;
		error: (err: Error) => void;
		complete: () => void;
	},
) {
	let unlisten: (() => void) | null = null;
	let disposed = false;

	const inp = normalizeTransformer(transformer, "input");
	const out = normalizeTransformer(transformer, "output");
	const serializedInput = inp.serialize(input);

	const safePath = path.replace(/\./g, "/");
	const inputSuffix =
		serializedInput !== null && serializedInput !== undefined
			? `:${typeof serializedInput === "string" ? serializedInput : JSON.stringify(serializedInput)}`
			: "";
	const eventName = `trpc_sub:${safePath}${inputSuffix}`;

	tauriInvoke("trpc_subscribe", {
		path,
		input: serializedInput ?? null,
	}).catch((err) => {
		if (!disposed) {
			observer.error(
				new Error(typeof err === "string" ? err : JSON.stringify(err)),
			);
		}
	});

	tauriListen(eventName, (payload) => {
		if (disposed) return;
		const data = out.deserialize(payload);
		observer.next({ result: { data } });
	}).then((fn) => {
		if (disposed) {
			fn();
		} else {
			unlisten = fn;
		}
	});

	return () => {
		disposed = true;
		unlisten?.();
	};
}