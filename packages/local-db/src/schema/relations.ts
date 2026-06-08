import { relations } from "drizzle-orm";
import {
	agentActivities,
	memoryEpisodes,
	memoryPolicies,
	memorySkills,
	memoryTraces,
	memoryWorldModels,
	projects,
	spaces,
	workspaceSections,
	workspaces,
	worktrees,
} from "./schema";

export const spacesRelations = relations(spaces, ({ many }) => ({
	projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
	worktrees: many(worktrees),
	workspaces: many(workspaces),
	workspaceSections: many(workspaceSections),
	agentActivities: many(agentActivities),
	memoryEpisodes: many(memoryEpisodes),
	memoryTraces: many(memoryTraces),
	memoryPolicies: many(memoryPolicies),
	memoryWorldModels: many(memoryWorldModels),
	memorySkills: many(memorySkills),
	space: one(spaces, {
		fields: [projects.spaceId],
		references: [spaces.id],
	}),
}));

export const worktreesRelations = relations(worktrees, ({ one, many }) => ({
	project: one(projects, {
		fields: [worktrees.projectId],
		references: [projects.id],
	}),
	workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	worktree: one(worktrees, {
		fields: [workspaces.worktreeId],
		references: [worktrees.id],
	}),
	section: one(workspaceSections, {
		fields: [workspaces.sectionId],
		references: [workspaceSections.id],
	}),
	agentActivities: many(agentActivities),
}));

export const workspaceSectionsRelations = relations(
	workspaceSections,
	({ one, many }) => ({
		project: one(projects, {
			fields: [workspaceSections.projectId],
			references: [projects.id],
		}),
		workspaces: many(workspaces),
	}),
);

export const agentActivitiesRelations = relations(
	agentActivities,
	({ one, many }) => ({
		workspace: one(workspaces, {
			fields: [agentActivities.workspaceId],
			references: [workspaces.id],
		}),
		project: one(projects, {
			fields: [agentActivities.projectId],
			references: [projects.id],
		}),
		memoryEpisodes: many(memoryEpisodes),
	}),
);

// =============================================================================
// Cognitive Memory Relations
// =============================================================================

export const memoryEpisodesRelations = relations(
	memoryEpisodes,
	({ one, many }) => ({
		project: one(projects, {
			fields: [memoryEpisodes.projectId],
			references: [projects.id],
		}),
		workspace: one(workspaces, {
			fields: [memoryEpisodes.workspaceId],
			references: [workspaces.id],
		}),
		agentActivity: one(agentActivities, {
			fields: [memoryEpisodes.agentActivityId],
			references: [agentActivities.id],
		}),
		traces: many(memoryTraces),
	}),
);

export const memoryTracesRelations = relations(memoryTraces, ({ one }) => ({
	episode: one(memoryEpisodes, {
		fields: [memoryTraces.episodeId],
		references: [memoryEpisodes.id],
	}),
	project: one(projects, {
		fields: [memoryTraces.projectId],
		references: [projects.id],
	}),
}));

export const memoryPoliciesRelations = relations(
	memoryPolicies,
	({ one }) => ({
		project: one(projects, {
			fields: [memoryPolicies.projectId],
			references: [projects.id],
		}),
	}),
);

export const memoryWorldModelsRelations = relations(
	memoryWorldModels,
	({ one }) => ({
		project: one(projects, {
			fields: [memoryWorldModels.projectId],
			references: [projects.id],
		}),
	}),
);

export const memorySkillsRelations = relations(memorySkills, ({ one }) => ({
	project: one(projects, {
		fields: [memorySkills.projectId],
		references: [projects.id],
	}),
}));
