import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "..";

export const createTabAiRouter = () => {
	return router({
		generateTabTitle: publicProcedure
			.input(
				z.object({
					userMessage: z.string(),
					currentTitle: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				let apiKey: string | null = null;
				let baseUrl = "https://api.anthropic.com";
				let model = "deepseek-v4-flash";

				try {
					// biome-ignore lint/suspicious/noExplicitAny: drizzle type inference
					const settingsRow = (localDb.select().from(settings as any).get() ??
						{}) as Record<string, unknown>;
					apiKey =
						(settingsRow.anthropicApiKey as string) ||
						process.env.ANTHROPIC_API_KEY ||
						null;
					baseUrl =
						(settingsRow.anthropicBaseUrl as string) ||
						"https://api.anthropic.com";
					model =
						(settingsRow.anthropicModel as string) || "deepseek-v4-flash";
				} catch {
					apiKey = process.env.ANTHROPIC_API_KEY || null;
				}

				if (!apiKey) {
					return { title: null, description: null, reason: "no_api_key" };
				}

				const systemPrompt = `You generate concise tab titles for a code editor. Given a user message sent to an AI coding agent, return a JSON object with:
- "title": A concise tab title (max 20 characters) summarizing the task. Use the language of the user message.
- "description": A more detailed one-line description (max 80 characters) of the current task. Use the language of the user message.
- "should_update": boolean - false if the message is too vague to derive a meaningful title (e.g. "继续", "go on", "yes", "ok", "帮我看看", "continue", single word confirmations).

If should_update is false, title and description should be null.
Respond ONLY with the JSON object, no markdown fences.`;

				const userContent = input.currentTitle
					? `Current tab title: "${input.currentTitle}"\nUser message: ${input.userMessage}`
					: `User message: ${input.userMessage}`;

				try {
					const response = await fetch(`${baseUrl}/v1/messages`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-api-key": apiKey,
							"anthropic-version": "2023-06-01",
							"User-Agent": "claude-cli/2.1.44 (external, sdk-cli)",
						},
						body: JSON.stringify({
							model,
							max_tokens: 256,
							system: systemPrompt,
							messages: [{ role: "user", content: userContent }],
						}),
					});

					if (!response.ok) {
						return { title: null, description: null, reason: "api_error" };
					}

					const data = await response.json();
					// biome-ignore lint/suspicious/noExplicitAny: API response parsing
					const textBlock = data?.content?.find(
						(c: any) => c.type === "text",
					);
					const text = textBlock?.text || null;
					if (!text) {
						return { title: null, description: null, reason: "empty_response" };
					}

					const parsed = JSON.parse(text);
					if (!parsed.should_update) {
						return {
							title: null,
							description: null,
							reason: "vague_message",
						};
					}

					return {
						title: (parsed.title as string)?.slice(0, 20) || null,
						description: (parsed.description as string)?.slice(0, 80) || null,
						reason: null,
					};
				} catch {
					return { title: null, description: null, reason: "error" };
				}
			}),
	});
};
