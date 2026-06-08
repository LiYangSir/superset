import { router } from "../..";
import { createCognitiveSkillsRouter } from "./cognitive-skills";
import { createEpisodesRouter } from "./episodes";
import { createLegacyMemoryRouter } from "./legacy";
import { createPipelineRouter } from "./pipeline";
import { createPoliciesRouter } from "./policies";
import { createRetrievalRouter } from "./retrieval";
import { createTracesRouter } from "./traces";
import { createWorldModelsRouter } from "./world-models";

export const createMemoryRouter = () => {
	const legacy = createLegacyMemoryRouter();
	const episodes = createEpisodesRouter();
	const traces = createTracesRouter();
	const policies = createPoliciesRouter();
	const worldModels = createWorldModelsRouter();
	const cognitiveSkills = createCognitiveSkillsRouter();
	const pipeline = createPipelineRouter();
	const retrieval = createRetrievalRouter();

	return router({
		// Keep summarizeSession (called by agent hook listener)
		// Keep getForSession (injects memory into agent prompts)
		// Keep regenerateFiles (sync button in UI header)
		summarizeSession: legacy.summarizeSession,
		getForSession: legacy.getForSession,
		regenerateFiles: legacy.regenerateFiles,

		// Cognitive memory sub-routers
		episodes,
		traces,
		policies,
		worldModels,
		cognitiveSkills,
		pipeline,
		retrieval,
	});
};
