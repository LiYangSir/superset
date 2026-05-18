import { relations } from "drizzle-orm";
import {
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

export const workspacesRelations = relations(workspaces, ({ one }) => ({
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
