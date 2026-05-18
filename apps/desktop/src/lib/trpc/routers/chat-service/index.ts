import { createAuthStorage } from "mastracode";
import type { AuthStatusLike } from "shared/ai/provider-status";
import { router } from "../..";

/**
 * Local replacement for the deleted `@superset/chat` host runtime. The cloud
 * chat router is gone; we now expose just enough auth introspection for the
 * model-providers router to keep functioning, sourced from mastracode's local
 * auth storage.
 */
export class ChatService {
	private getAuthEntry(provider: "anthropic" | "openai-codex") {
		try {
			const storage = createAuthStorage();
			storage.reload();
			return storage.get(provider);
		} catch {
			return undefined;
		}
	}

	private toStatus(
		entry: ReturnType<ChatService["getAuthEntry"]>,
	): AuthStatusLike {
		if (!entry) {
			return {
				authenticated: false,
				method: null,
				source: null,
				issue: null,
			};
		}
		if (entry.type === "oauth") {
			return {
				authenticated: true,
				method: "oauth",
				source: "external",
				issue: null,
			};
		}
		if (entry.type === "api_key" && entry.key.trim()) {
			return {
				authenticated: true,
				method: "api_key",
				source: "external",
				issue: null,
			};
		}
		return {
			authenticated: false,
			method: null,
			source: null,
			issue: null,
		};
	}

	async getAnthropicAuthStatus(): Promise<AuthStatusLike> {
		return this.toStatus(this.getAuthEntry("anthropic"));
	}

	async getOpenAIAuthStatus(): Promise<AuthStatusLike> {
		return this.toStatus(this.getAuthEntry("openai-codex"));
	}
}

export const chatService = new ChatService();

export const createChatServiceRouter = () => router({});

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
