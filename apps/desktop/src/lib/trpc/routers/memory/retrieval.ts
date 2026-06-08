import {
	memoryPolicies,
	memorySkills,
	memoryWorldModels,
} from "@superset/local-db";
import { and, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	computeEmbedding,
	isEmbeddingReady,
	rerankBySimilarity,
	warmupEmbedding,
} from "./embedding";

export const createRetrievalRouter = () => {
	return router({
		getForSession: publicProcedure
			.input(z.object({ projectId: z.string().optional() }))
			.query(({ input }) => {
				const projectCondition = input.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, input.projectId),
						)
					: eq(memoryPolicies.scope, "global");

				const activeSkills = localDb
					.select()
					.from(memorySkills)
					.where(
						and(
							eq(memorySkills.status, "active"),
							input.projectId
								? or(
										eq(memorySkills.scope, "global"),
										eq(memorySkills.projectId, input.projectId),
									)
								: eq(memorySkills.scope, "global"),
						),
					)
					.orderBy(desc(memorySkills.eta))
					.limit(5)
					.all();

				const activePolicies = localDb
					.select()
					.from(memoryPolicies)
					.where(and(eq(memoryPolicies.status, "active"), projectCondition))
					.orderBy(desc(memoryPolicies.support), desc(memoryPolicies.gain))
					.limit(30)
					.all();

				const activeWorldModels = localDb
					.select()
					.from(memoryWorldModels)
					.where(
						and(
							eq(memoryWorldModels.status, "active"),
							input.projectId
								? or(
										eq(memoryWorldModels.scope, "global"),
										eq(memoryWorldModels.projectId, input.projectId),
									)
								: eq(memoryWorldModels.scope, "global"),
						),
					)
					.orderBy(desc(memoryWorldModels.confidence))
					.limit(15)
					.all();

				if (
					activeSkills.length === 0 &&
					activePolicies.length === 0 &&
					activeWorldModels.length === 0
				) {
					return null;
				}

				const sections: string[] = [];

				if (activeSkills.length > 0) {
					sections.push("## Crystallized Skills");
					for (const skill of activeSkills) {
						sections.push(`- **${skill.name}**: ${skill.invocationGuide}`);
					}
					sections.push("");
				}

				if (activePolicies.length > 0) {
					sections.push("## Policies");
					const byCategory = new Map<string, typeof activePolicies>();
					for (const p of activePolicies) {
						const cat = p.category || "General";
						if (!byCategory.has(cat)) byCategory.set(cat, []);
						byCategory.get(cat)?.push(p);
					}
					for (const [cat, policies] of byCategory) {
						sections.push(`### ${cat}`);
						for (const p of policies) {
							sections.push(`- WHEN ${p.trigger} THEN ${p.procedure}`);
						}
					}
					sections.push("");
				}

				const envModels = activeWorldModels.filter(
					(m) => m.modelType === "environment",
				);
				const infModels = activeWorldModels.filter(
					(m) => m.modelType === "inference",
				);
				const conModels = activeWorldModels.filter(
					(m) => m.modelType === "constraint",
				);

				if (envModels.length > 0) {
					sections.push("## Environment Knowledge");
					for (const m of envModels) sections.push(`- ${m.content}`);
					sections.push("");
				}

				if (infModels.length > 0) {
					sections.push("## Behavioral Rules");
					for (const m of infModels) sections.push(`- ${m.content}`);
					sections.push("");
				}

				if (conModels.length > 0) {
					sections.push("## Constraints");
					for (const m of conModels) sections.push(`- ${m.content}`);
					sections.push("");
				}

				return sections.join("\n");
			}),

		semanticSearch: publicProcedure
			.input(
				z.object({
					query: z.string().min(1),
					projectId: z.string().optional(),
					limit: z.number().min(1).max(50).default(10),
				}),
			)
			.query(async ({ input }) => {
				const queryVec = await computeEmbedding(input.query);
				if (!queryVec) {
					return { policies: [], worldModels: [], skills: [] };
				}

				const projPolicyCond = input.projectId
					? or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, input.projectId),
						)
					: eq(memoryPolicies.scope, "global");

				const policies = localDb
					.select()
					.from(memoryPolicies)
					.where(and(eq(memoryPolicies.status, "active"), projPolicyCond))
					.orderBy(desc(memoryPolicies.support))
					.limit(100)
					.all();

				const rankedPolicies = rerankBySimilarity(
					policies,
					queryVec,
					0.4,
					(p, _i) => {
						const supportScore = Math.min(p.support / 10, 1);
						const gainScore = p.gain ?? 0;
						return 0.6 * supportScore + 0.4 * gainScore;
					},
				).slice(0, input.limit);

				const worldModels = localDb
					.select()
					.from(memoryWorldModels)
					.where(
						and(
							eq(memoryWorldModels.status, "active"),
							input.projectId
								? or(
										eq(memoryWorldModels.scope, "global"),
										eq(memoryWorldModels.projectId, input.projectId),
									)
								: eq(memoryWorldModels.scope, "global"),
						),
					)
					.limit(50)
					.all();

				const rankedModels = rerankBySimilarity(
					worldModels,
					queryVec,
					0.4,
					(m) => m.confidence,
				).slice(0, input.limit);

				const skills = localDb
					.select()
					.from(memorySkills)
					.where(
						and(
							eq(memorySkills.status, "active"),
							input.projectId
								? or(
										eq(memorySkills.scope, "global"),
										eq(memorySkills.projectId, input.projectId),
									)
								: eq(memorySkills.scope, "global"),
						),
					)
					.limit(30)
					.all();

				const rankedSkills = rerankBySimilarity(
					skills,
					queryVec,
					0.4,
					(s) => s.eta,
				).slice(0, Math.min(5, input.limit));

				return {
					policies: rankedPolicies.map((p) => ({
						id: p.id,
						trigger: p.trigger,
						procedure: p.procedure,
						support: p.support,
						gain: p.gain,
						category: p.category,
					})),
					worldModels: rankedModels.map((m) => ({
						id: m.id,
						modelType: m.modelType,
						content: m.content,
						confidence: m.confidence,
					})),
					skills: rankedSkills.map((s) => ({
						id: s.id,
						name: s.name,
						invocationGuide: s.invocationGuide,
						eta: s.eta,
					})),
				};
			}),

		embeddingStatus: publicProcedure.query(() => {
			return { ready: isEmbeddingReady() };
		}),

		warmup: publicProcedure.mutation(async () => {
			const ok = await warmupEmbedding();
			return { success: ok };
		}),
	});
};
