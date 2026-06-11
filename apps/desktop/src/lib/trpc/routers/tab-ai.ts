import { z } from "zod";
import { publicProcedure, router } from "..";
import { getConfiguredAiCliAgent, runAiCliWithTempCwd } from "./utils/ai-cli";

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
					const result = await runAiCliWithTempCwd(
						`${systemPrompt}\n\n${userContent}`,
						{
							agent: getConfiguredAiCliAgent(),
							timeoutMs: 60_000,
						},
					);

					if (!result.ok) {
						return {
							title: null,
							description: null,
							reason: result.reason,
						};
					}

					const parsed = JSON.parse(result.text);
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
