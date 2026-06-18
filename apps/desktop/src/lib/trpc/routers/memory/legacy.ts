import { memoryEpisodes, memoryTraces } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspaceWithRelations } from "../workspaces/utils/db-helpers";
import { runPipeline } from "./pipeline";
import {
	parseTranscriptToTraces,
	readFullClaudeSession,
} from "./session-reader";
import { syncCognitiveMemoryToFiles } from "./sync";

type InsertBuilder = {
	values: (value: unknown) => {
		returning: () => { get: () => { id: string } };
		run: () => void;
	};
};

type MemoryWriteDb = {
	insert: (table: unknown) => InsertBuilder;
	transaction: (
		callback: (tx: { insert: (table: unknown) => InsertBuilder }) => void,
	) => void;
};

export const createLegacyMemoryRouter = () => {
	return router({
		regenerateFiles: publicProcedure
			.input(z.object({ projectId: z.string().optional() }))
			.mutation(({ input }) => {
				return syncCognitiveMemoryToFiles(input.projectId);
			}),

		summarizeSession: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().optional(),
					projectId: z.string().optional(),
					projectPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log("[memory] summarizeSession called:", {
					workspaceId: input.workspaceId,
					projectId: input.projectId,
				});

				let projectId = input.projectId;
				let projectPath = input.projectPath;

				if (input.workspaceId && (!projectId || !projectPath)) {
					const relations = getWorkspaceWithRelations(input.workspaceId);
					if (relations?.project) {
						projectId = projectId || relations.project.id;
						projectPath = projectPath || relations.project.mainRepoPath;
					}
				}

				return createCognitiveEpisode(projectPath, projectId);
			}),
	});
};

async function createCognitiveEpisode(
	projectPath?: string,
	projectId?: string,
) {
	const rawMessages = readFullClaudeSession(projectPath);
	if (!rawMessages || rawMessages.length === 0) {
		console.log("[memory] cognitive: no session messages found");
		return { success: false, reason: "no_session_messages" as const };
	}

	const turns = parseTranscriptToTraces(rawMessages);
	if (turns.length === 0) {
		console.log("[memory] cognitive: no turns parsed");
		return { success: false, reason: "no_turns" as const };
	}

	const firstUserText = turns.find((t) => t.userText)?.userText;
	const title = firstUserText
		? firstUserText.slice(0, 100) + (firstUserText.length > 100 ? "..." : "")
		: "Agent Session";

	const db = localDb as unknown as MemoryWriteDb;
	const episode = db
		.insert(memoryEpisodes)
		.values({
			projectId: projectId ?? null,
			title,
			status: "finalized",
			traceCount: turns.length,
		})
		.returning()
		.get();

	db.transaction((tx) => {
		for (const turn of turns) {
			tx.insert(memoryTraces)
				.values({
					episodeId: episode.id,
					projectId: projectId ?? null,
					turnIndex: turn.turnIndex,
					userText: turn.userText,
					agentText: turn.agentText ? turn.agentText.slice(0, 2000) : null,
					toolCalls: turn.toolCalls.length > 0 ? turn.toolCalls : null,
					agentThinking: turn.agentThinking
						? turn.agentThinking.slice(0, 1000)
						: null,
					tags: turn.tags.length > 0 ? turn.tags : null,
					errorSignatures:
						turn.errorSignatures.length > 0 ? turn.errorSignatures : null,
				})
				.run();
		}
	});

	console.log(
		"[memory] cognitive: created episode",
		episode.id,
		"with",
		turns.length,
		"traces - triggering pipeline",
	);

	return runPipeline(episode.id);
}
