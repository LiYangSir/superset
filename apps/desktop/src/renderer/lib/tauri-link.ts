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
	const serializedInput = transformer
		? (transformer as { input: { serialize: (v: unknown) => unknown } }).input.serialize(input)
		: input;

	tauriInvoke("trpc_call", {
		path,
		type,
		input: serializedInput ?? null,
	})
		.then((result) => {
			const data = transformer
				? (transformer as { output: { deserialize: (v: unknown) => unknown } }).output.deserialize(result)
				: result;
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

	const eventName = `trpc_sub:${path}`;

	const serializedInput = transformer
		? (transformer as { input: { serialize: (v: unknown) => unknown } }).input.serialize(input)
		: input;

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
		const data = transformer
			? (transformer as { output: { deserialize: (v: unknown) => unknown } }).output.deserialize(payload)
			: payload;
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

export function isTauri(): boolean {
	return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}
