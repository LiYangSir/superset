import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import type {
	BranchPrefixMode,
	ExternalApp,
	FileOpenMode,
	GitHubStatus,
	GitStatus,
	TerminalLinkBehavior,
	TerminalPreset,
	WorkspaceType,
} from "./zod";

/**
 * Spaces - top-level groupings of projects shown in the sidebar.
 * One built-in `isDefault: true` row exists; new projects join it on creation.
 * A non-Default Space can only be deleted when no projects reference it
 * (enforced by `onDelete: "restrict"` on projects.spaceId).
 */
export const spaces = sqliteTable("spaces", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv4()),
	name: text("name").notNull(),
	color: text("color").notNull(),
	isDefault: integer("is_default", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: integer("created_at")
		.notNull()
		.$defaultFn(() => Date.now()),
});

export type InsertSpace = typeof spaces.$inferInsert;
export type SelectSpace = typeof spaces.$inferSelect;

/**
 * Projects table - represents a git repository that the user has opened
 */
export const projects = sqliteTable(
	"projects",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		mainRepoPath: text("main_repo_path").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		tabOrder: integer("tab_order"),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		configToastDismissed: integer("config_toast_dismissed", {
			mode: "boolean",
		}),
		defaultBranch: text("default_branch"),
		workspaceBaseBranch: text("workspace_base_branch"),
		githubOwner: text("github_owner"),
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		worktreeBaseDir: text("worktree_base_dir"),
		hideImage: integer("hide_image", { mode: "boolean" }),
		iconUrl: text("icon_url"),
		neonProjectId: text("neon_project_id"),
		defaultApp: text("default_app").$type<ExternalApp>(),
		spaceId: text("space_id").references(() => spaces.id, {
			onDelete: "restrict",
		}),
		weeklyReportEnabled: integer("weekly_report_enabled", {
			mode: "boolean",
		}).default(true),
	},
	(table) => [
		index("projects_main_repo_path_idx").on(table.mainRepoPath),
		index("projects_last_opened_at_idx").on(table.lastOpenedAt),
		index("projects_space_id_idx").on(table.spaceId),
	],
);

export type InsertProject = typeof projects.$inferInsert;
export type SelectProject = typeof projects.$inferSelect;

/**
 * Worktrees table - represents a git worktree within a project
 */
export const worktrees = sqliteTable(
	"worktrees",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		branch: text("branch").notNull(),
		baseBranch: text("base_branch"), // The branch this worktree was created from
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		gitStatus: text("git_status", { mode: "json" }).$type<GitStatus>(),
		githubStatus: text("github_status", { mode: "json" }).$type<GitHubStatus>(),
	},
	(table) => [
		index("worktrees_project_id_idx").on(table.projectId),
		index("worktrees_branch_idx").on(table.branch),
	],
);

export type InsertWorktree = typeof worktrees.$inferInsert;
export type SelectWorktree = typeof worktrees.$inferSelect;

/**
 * Workspaces table - represents an active workspace (worktree or branch-based)
 */
export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreeId: text("worktree_id").references(() => worktrees.id, {
			onDelete: "cascade",
		}), // Only set for type="worktree"
		type: text("type").notNull().$type<WorkspaceType>(),
		branch: text("branch").notNull(), // Branch name for both types
		name: text("name").notNull(),
		tabOrder: integer("tab_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		isUnread: integer("is_unread", { mode: "boolean" }).default(false),
		// Whether the workspace has an auto-generated name (branch name) that should prompt for rename
		isUnnamed: integer("is_unnamed", { mode: "boolean" }).default(false),
		// Timestamp when deletion was initiated. Non-null means deletion in progress.
		// Workspaces with deletingAt set should be filtered out from queries.
		deletingAt: integer("deleting_at"),
		// Allocated port base for multi-worktree dev instances.
		// Each workspace gets a range of 10 ports starting from this base.
		portBase: integer("port_base"),
		sectionId: text("section_id").references(() => workspaceSections.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_worktree_id_idx").on(table.worktreeId),
		index("workspaces_last_opened_at_idx").on(table.lastOpenedAt),
		index("workspaces_section_id_idx").on(table.sectionId),
		// NOTE: Migration 0006 creates an additional partial unique index:
		// CREATE UNIQUE INDEX workspaces_unique_branch_per_project
		//   ON workspaces(project_id) WHERE type = 'branch'
		// This enforces one branch workspace per project. Drizzle's schema DSL
		// doesn't support partial/filtered indexes, so this constraint is only
		// applied via the migration, not schema push. See migration 0006 for details.
	],
);

export type InsertWorkspace = typeof workspaces.$inferInsert;
export type SelectWorkspace = typeof workspaces.$inferSelect;

/**
 * Workspace sections - user-created groups within a project for organizing workspaces
 */
export const workspaceSections = sqliteTable(
	"workspace_sections",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tabOrder: integer("tab_order").notNull(),
		isCollapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
		color: text("color"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("workspace_sections_project_id_idx").on(table.projectId)],
);

export type InsertWorkspaceSection = typeof workspaceSections.$inferInsert;
export type SelectWorkspaceSection = typeof workspaceSections.$inferSelect;

export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	lastActiveWorkspaceId: text("last_active_workspace_id"),
	terminalPresets: text("terminal_presets", { mode: "json" }).$type<
		TerminalPreset[]
	>(),
	terminalPresetsInitialized: integer("terminal_presets_initialized", {
		mode: "boolean",
	}),
	selectedRingtoneId: text("selected_ringtone_id"),
	activeOrganizationId: text("active_organization_id"),
	confirmOnQuit: integer("confirm_on_quit", { mode: "boolean" }),
	terminalLinkBehavior: text(
		"terminal_link_behavior",
	).$type<TerminalLinkBehavior>(),
	terminalPersistence: integer("persist_terminal", { mode: "boolean" }).default(
		true,
	),
	autoApplyDefaultPreset: integer("auto_apply_default_preset", {
		mode: "boolean",
	}),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	notificationSoundsMuted: integer("notification_sounds_muted", {
		mode: "boolean",
	}),
	deleteLocalBranch: integer("delete_local_branch", { mode: "boolean" }),
	fileOpenMode: text("file_open_mode").$type<FileOpenMode>(),
	showPresetsBar: integer("show_presets_bar", { mode: "boolean" }),
	useCompactTerminalAddButton: integer("use_compact_terminal_add_button", {
		mode: "boolean",
	}),
	terminalFontFamily: text("terminal_font_family"),
	terminalFontSize: integer("terminal_font_size"),
	editorFontFamily: text("editor_font_family"),
	editorFontSize: integer("editor_font_size"),
	showResourceMonitor: integer("show_resource_monitor", { mode: "boolean" }),
	worktreeBaseDir: text("worktree_base_dir"),
	openLinksInApp: integer("open_links_in_app", { mode: "boolean" }),
	defaultEditor: text("default_editor").$type<ExternalApp>(),
	anthropicApiKey: text("anthropic_api_key"),
	anthropicBaseUrl: text("anthropic_base_url"),
	anthropicModel: text("anthropic_model"),
});

export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

// =============================================================================
// Synced tables - mirrored from cloud Postgres via Electric SQL
// Column names match Postgres exactly (snake_case) so Electric data writes directly
// =============================================================================

export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type IntegrationProvider = "linear";

/**
 * Users table - synced from cloud
 */
export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerk_id: text("clerk_id").notNull().unique(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		avatar_url: text("avatar_url"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerk_id),
	],
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

/**
 * Organizations table - synced from cloud
 */
export const organizations = sqliteTable(
	"organizations",
	{
		id: text("id").primaryKey(),
		clerk_org_id: text("clerk_org_id").unique(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		github_org: text("github_org"),
		avatar_url: text("avatar_url"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("organizations_slug_idx").on(table.slug),
		index("organizations_clerk_org_id_idx").on(table.clerk_org_id),
	],
);

export type InsertOrganization = typeof organizations.$inferInsert;
export type SelectOrganization = typeof organizations.$inferSelect;

/**
 * Organization members table - synced from cloud
 */
export const organizationMembers = sqliteTable(
	"organization_members",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		user_id: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organization_id),
		index("organization_members_user_id_idx").on(table.user_id),
	],
);

export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type SelectOrganizationMember = typeof organizationMembers.$inferSelect;

/**
 * Tasks table - synced from cloud
 */
export const tasks = sqliteTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").notNull(),
		status_color: text("status_color"),
		status_type: text("status_type"),
		status_position: integer("status_position"),
		priority: text("priority").notNull().$type<TaskPriority>(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repository_id: text("repository_id"),
		assignee_id: text("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creator_id: text("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		estimate: integer("estimate"),
		due_date: text("due_date"),
		labels: text("labels", { mode: "json" }).$type<string[]>(),
		branch: text("branch"),
		pr_url: text("pr_url"),
		external_provider: text("external_provider").$type<IntegrationProvider>(),
		external_id: text("external_id"),
		external_key: text("external_key"),
		external_url: text("external_url"),
		last_synced_at: text("last_synced_at"),
		sync_error: text("sync_error"),
		started_at: text("started_at"),
		completed_at: text("completed_at"),
		deleted_at: text("deleted_at"),
		archived_at: text("archived_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organization_id),
		index("tasks_assignee_id_idx").on(table.assignee_id),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.created_at),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;

/**
 * Browser history table - persists browsing history for URL autocomplete
 */
export const browserHistory = sqliteTable(
	"browser_history",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull().unique(),
		title: text("title").notNull().default(""),
		faviconUrl: text("favicon_url"),
		lastVisitedAt: integer("last_visited_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		visitCount: integer("visit_count").notNull().default(1),
	},
	(table) => [
		index("browser_history_url_idx").on(table.url),
		index("browser_history_last_visited_at_idx").on(table.lastVisitedAt),
	],
);

export type InsertBrowserHistory = typeof browserHistory.$inferInsert;
export type SelectBrowserHistory = typeof browserHistory.$inferSelect;

// =============================================================================
// Task management local tables
// =============================================================================

export type TaskStatus =
	| "backlog"
	| "todo"
	| "in_progress"
	| "in_review"
	| "done"
	| "cancelled";

/**
 * Task subtasks - local-only, linked to cloud-synced tasks
 */
export const taskSubtasks = sqliteTable(
	"task_subtasks",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		done: integer("done", { mode: "boolean" }).notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("task_subtasks_task_id_idx").on(table.taskId)],
);

export type InsertTaskSubtask = typeof taskSubtasks.$inferInsert;
export type SelectTaskSubtask = typeof taskSubtasks.$inferSelect;

/**
 * Task labels - local-only label definitions scoped to an organization
 */
export const taskLabels = sqliteTable(
	"task_labels",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		name: text("name").notNull(),
		color: text("color").notNull(),
		organizationId: text("organization_id").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("task_labels_org_id_idx").on(table.organizationId)],
);

export type InsertTaskLabel = typeof taskLabels.$inferInsert;
export type SelectTaskLabel = typeof taskLabels.$inferSelect;

/**
 * Task comments - local-only comments on tasks
 */
export const taskComments = sqliteTable(
	"task_comments",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		author: text("author").notNull(),
		text: text("text").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("task_comments_task_id_idx").on(table.taskId)],
);

export type InsertTaskComment = typeof taskComments.$inferInsert;
export type SelectTaskComment = typeof taskComments.$inferSelect;

// =============================================================================
// Memory - stores session summaries, coding habits, requirements
// =============================================================================

export type MemoryScope = "global" | "project";

export const memories = sqliteTable(
	"memories",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		content: text("content").notNull(),
		scope: text("scope").notNull().$type<MemoryScope>(),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		category: text("category"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memories_scope_idx").on(table.scope),
		index("memories_project_id_idx").on(table.projectId),
	],
);

export type InsertMemory = typeof memories.$inferInsert;
export type SelectMemory = typeof memories.$inferSelect;

// =============================================================================
// Cognitive Memory System — MemOS-inspired multi-layer memory architecture
// L1 Traces → L2 Policies → L3 World Models → Skills
// =============================================================================

export type EpisodeStatus = "open" | "finalized";

export const memoryEpisodes = sqliteTable(
	"memory_episodes",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		workspaceId: text("workspace_id").references(() => workspaces.id, {
			onDelete: "set null",
		}),
		agentActivityId: text("agent_activity_id").references(
			() => agentActivities.id,
			{ onDelete: "set null" },
		),
		title: text("title").notNull(),
		summary: text("summary"),
		status: text("status").notNull().$type<EpisodeStatus>().default("open"),
		rHuman: real("r_human"),
		rGoalAchievement: real("r_goal_achievement"),
		rProcessQuality: real("r_process_quality"),
		rUserSatisfaction: real("r_user_satisfaction"),
		topicSignature: text("topic_signature"),
		traceCount: integer("trace_count").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memory_episodes_project_id_idx").on(table.projectId),
		index("memory_episodes_status_idx").on(table.status),
		index("memory_episodes_created_at_idx").on(table.createdAt),
		index("memory_episodes_agent_activity_id_idx").on(table.agentActivityId),
	],
);

export type InsertMemoryEpisode = typeof memoryEpisodes.$inferInsert;
export type SelectMemoryEpisode = typeof memoryEpisodes.$inferSelect;

/**
 * L1 Traces — one row per (think + action + observation) step within an episode.
 * Stores raw interaction data with algorithmic signals for reward backpropagation.
 */
export const memoryTraces = sqliteTable(
	"memory_traces",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		episodeId: text("episode_id")
			.notNull()
			.references(() => memoryEpisodes.id, { onDelete: "cascade" }),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		turnIndex: integer("turn_index").notNull(),
		userText: text("user_text"),
		agentText: text("agent_text"),
		toolCalls: text("tool_calls", { mode: "json" }).$type<
			Array<{ tool: string; input: string; output: string }>
		>(),
		agentThinking: text("agent_thinking"),
		reflection: text("reflection"),
		value: real("value"),
		alpha: real("alpha"),
		priority: real("priority"),
		tags: text("tags", { mode: "json" }).$type<string[]>(),
		errorSignatures: text("error_signatures", { mode: "json" }).$type<
			string[]
		>(),
		vecSummary: text("vec_summary", { mode: "json" }).$type<number[]>(),
		vecAction: text("vec_action", { mode: "json" }).$type<number[]>(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memory_traces_episode_id_idx").on(table.episodeId),
		index("memory_traces_project_id_idx").on(table.projectId),
		index("memory_traces_priority_idx").on(table.priority),
		index("memory_traces_created_at_idx").on(table.createdAt),
	],
);

export type InsertMemoryTrace = typeof memoryTraces.$inferInsert;
export type SelectMemoryTrace = typeof memoryTraces.$inferSelect;

/**
 * L2 Policies — cross-task procedural knowledge induced from patterns across traces.
 * Structure: trigger (when) → procedure (do) → verification (check) → boundary (never).
 */
export type PolicyExperienceType =
	| "success_pattern"
	| "failure_avoidance"
	| "preference"
	| "workflow"
	| "style";

export type PolicyStatus = "candidate" | "active" | "archived";

export const memoryPolicies = sqliteTable(
	"memory_policies",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		trigger: text("trigger").notNull(),
		procedure: text("procedure").notNull(),
		verification: text("verification"),
		boundary: text("boundary"),
		experienceType: text("experience_type")
			.notNull()
			.$type<PolicyExperienceType>()
			.default("preference"),
		status: text("status").notNull().$type<PolicyStatus>().default("candidate"),
		support: integer("support").notNull().default(1),
		gain: real("gain"),
		decisionGuidance: text("decision_guidance"),
		category: text("category"),
		scope: text("scope").notNull().$type<MemoryScope>().default("global"),
		vecSummary: text("vec_summary", { mode: "json" }).$type<number[]>(),
		sourceTraceIds: text("source_trace_ids", { mode: "json" }).$type<
			string[]
		>(),
		sourceEpisodeIds: text("source_episode_ids", { mode: "json" }).$type<
			string[]
		>(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memory_policies_project_id_idx").on(table.projectId),
		index("memory_policies_status_idx").on(table.status),
		index("memory_policies_experience_type_idx").on(table.experienceType),
		index("memory_policies_scope_idx").on(table.scope),
		index("memory_policies_category_idx").on(table.category),
	],
);

export type InsertMemoryPolicy = typeof memoryPolicies.$inferInsert;
export type SelectMemoryPolicy = typeof memoryPolicies.$inferSelect;

/**
 * L3 World Models — stable environmental/declarative knowledge.
 * Three types: environment (topology), inference (behavioral rules), constraint (taboos).
 */
export type WorldModelType = "environment" | "inference" | "constraint";
export type WorldModelStatus = "active" | "archived";

export const memoryWorldModels = sqliteTable(
	"memory_world_models",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		modelType: text("model_type").notNull().$type<WorldModelType>(),
		content: text("content").notNull(),
		confidence: real("confidence").notNull().default(0.5),
		domainTags: text("domain_tags", { mode: "json" }).$type<string[]>(),
		scope: text("scope").notNull().$type<MemoryScope>().default("global"),
		status: text("status")
			.notNull()
			.$type<WorldModelStatus>()
			.default("active"),
		sourcePolicyIds: text("source_policy_ids", { mode: "json" }).$type<
			string[]
		>(),
		vecSummary: text("vec_summary", { mode: "json" }).$type<number[]>(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memory_world_models_project_id_idx").on(table.projectId),
		index("memory_world_models_model_type_idx").on(table.modelType),
		index("memory_world_models_status_idx").on(table.status),
		index("memory_world_models_scope_idx").on(table.scope),
	],
);

export type InsertMemoryWorldModel = typeof memoryWorldModels.$inferInsert;
export type SelectMemoryWorldModel = typeof memoryWorldModels.$inferSelect;

/**
 * Memory Skills — crystallized callable capabilities refined from L2 policies + L3 world models.
 * eta tracks adoption rate via Beta(1,1) posterior: eta = (trialsPassed+1)/(trialsAttempted+2).
 */
export type MemorySkillStatus = "candidate" | "active" | "archived";

export const memorySkills = sqliteTable(
	"memory_skills",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		invocationGuide: text("invocation_guide").notNull(),
		procedureJson: text("procedure_json", { mode: "json" }).$type<
			Array<{ step: number; action: string; detail: string }>
		>(),
		eta: real("eta").notNull().default(0),
		trialsAttempted: integer("trials_attempted").notNull().default(0),
		trialsPassed: integer("trials_passed").notNull().default(0),
		evidenceAnchors: text("evidence_anchors", { mode: "json" }).$type<
			string[]
		>(),
		status: text("status")
			.notNull()
			.$type<MemorySkillStatus>()
			.default("candidate"),
		scope: text("scope").notNull().$type<MemoryScope>().default("global"),
		vecSummary: text("vec_summary", { mode: "json" }).$type<number[]>(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("memory_skills_project_id_idx").on(table.projectId),
		index("memory_skills_status_idx").on(table.status),
		index("memory_skills_scope_idx").on(table.scope),
		index("memory_skills_eta_idx").on(table.eta),
	],
);

export type InsertMemorySkill = typeof memorySkills.$inferInsert;
export type SelectMemorySkill = typeof memorySkills.$inferSelect;

// =============================================================================
// Agent Activities - tracks agent lifecycle events per workspace/branch
// =============================================================================

export type AgentActivityStatus =
	| "in_progress"
	| "waiting_for_input"
	| "completed"
	| "failed";

export const agentActivities = sqliteTable(
	"agent_activities",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		tabId: text("tab_id"),
		paneId: text("pane_id"),
		tabName: text("tab_name"),
		presetName: text("preset_name"),
		modelName: text("model_name"),
		branch: text("branch").notNull(),
		status: text("status").notNull().default("in_progress"),
		title: text("title"),
		summary: text("summary"),
		userMessage: text("user_message"),
		metadata: text("metadata"),
		startedAt: integer("started_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		endedAt: integer("ended_at"),
		durationMs: integer("duration_ms"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		archivedAt: integer("archived_at"),
	},
	(table) => [
		index("agent_activities_workspace_id_idx").on(table.workspaceId),
		index("agent_activities_project_id_idx").on(table.projectId),
		index("agent_activities_branch_idx").on(table.branch),
		index("agent_activities_status_idx").on(table.status),
		index("agent_activities_started_at_idx").on(table.startedAt),
		index("agent_activities_archived_at_idx").on(table.archivedAt),
	],
);

export type InsertAgentActivity = typeof agentActivities.$inferInsert;
export type SelectAgentActivity = typeof agentActivities.$inferSelect;

// =============================================================================
// Skills management tables
// =============================================================================

export type SkillSourceType = "local" | "import" | "git" | "skillssh";
export type SkillUpdateStatus =
	| "up_to_date"
	| "update_available"
	| "unknown"
	| "checking"
	| "updating"
	| "error"
	| "local_only"
	| "source_missing";
export type SkillSyncMode = "symlink" | "copy";
export type SkillSyncStatus =
	| "synced"
	| "pending"
	| "error"
	| "removed"
	| "orphaned";
export type SkillToolCategory = "coding" | "lobster";

export const skills = sqliteTable(
	"skills",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		name: text("name").notNull(),
		description: text("description"),
		sourceType: text("source_type").notNull().$type<SkillSourceType>(),
		sourceRef: text("source_ref"),
		sourceRefResolved: text("source_ref_resolved"),
		sourceSubpath: text("source_subpath"),
		sourceBranch: text("source_branch"),
		sourceRevision: text("source_revision"),
		remoteRevision: text("remote_revision"),
		updateStatus: text("update_status")
			.notNull()
			.$type<SkillUpdateStatus>()
			.default("unknown"),
		lastCheckedAt: integer("last_checked_at"),
		lastCheckError: text("last_check_error"),
		centralPath: text("central_path").notNull().unique(),
		contentHash: text("content_hash"),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("skills_source_type_idx").on(table.sourceType),
		index("skills_central_path_idx").on(table.centralPath),
		index("skills_update_status_idx").on(table.updateStatus),
	],
);

export type InsertSkill = typeof skills.$inferInsert;
export type SelectSkill = typeof skills.$inferSelect;

export const skillTargets = sqliteTable(
	"skill_targets",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		skillId: text("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		tool: text("tool").notNull(),
		targetPath: text("target_path").notNull(),
		mode: text("mode").notNull().$type<SkillSyncMode>().default("symlink"),
		status: text("status")
			.notNull()
			.$type<SkillSyncStatus>()
			.default("pending"),
		syncedAt: integer("synced_at"),
		sourceHash: text("source_hash"),
		lastError: text("last_error"),
	},
	(table) => [
		index("skill_targets_skill_id_idx").on(table.skillId),
		index("skill_targets_tool_idx").on(table.tool),
	],
);

export type InsertSkillTarget = typeof skillTargets.$inferInsert;
export type SelectSkillTarget = typeof skillTargets.$inferSelect;

export const skillPresets = sqliteTable("skill_presets", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv4()),
	name: text("name").notNull(),
	description: text("description"),
	icon: text("icon"),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at")
		.notNull()
		.$defaultFn(() => Date.now()),
	updatedAt: integer("updated_at")
		.notNull()
		.$defaultFn(() => Date.now()),
});

export type InsertSkillPreset = typeof skillPresets.$inferInsert;
export type SelectSkillPreset = typeof skillPresets.$inferSelect;

export const skillPresetSkills = sqliteTable(
	"skill_preset_skills",
	{
		presetId: text("preset_id")
			.notNull()
			.references(() => skillPresets.id, { onDelete: "cascade" }),
		skillId: text("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(table) => [
		index("skill_preset_skills_preset_id_idx").on(table.presetId),
		index("skill_preset_skills_skill_id_idx").on(table.skillId),
	],
);

export type InsertSkillPresetSkill = typeof skillPresetSkills.$inferInsert;
export type SelectSkillPresetSkill = typeof skillPresetSkills.$inferSelect;

export const skillPresetToolToggles = sqliteTable(
	"skill_preset_tool_toggles",
	{
		presetId: text("preset_id")
			.notNull()
			.references(() => skillPresets.id, { onDelete: "cascade" }),
		skillId: text("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		tool: text("tool").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	},
	(table) => [
		index("skill_preset_tool_toggles_preset_id_idx").on(table.presetId),
		index("skill_preset_tool_toggles_skill_id_idx").on(table.skillId),
	],
);

export type InsertSkillPresetToolToggle =
	typeof skillPresetToolToggles.$inferInsert;
export type SelectSkillPresetToolToggle =
	typeof skillPresetToolToggles.$inferSelect;

export const skillSettings = sqliteTable("skill_settings", {
	key: text("key").primaryKey(),
	value: text("value"),
});

export type InsertSkillSetting = typeof skillSettings.$inferInsert;
export type SelectSkillSetting = typeof skillSettings.$inferSelect;

export const skillAuditLog = sqliteTable(
	"skill_audit_log",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		action: text("action").notNull(),
		skillId: text("skill_id"),
		skillName: text("skill_name"),
		tool: text("tool"),
		detail: text("detail"),
		success: integer("success", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("skill_audit_log_action_idx").on(table.action),
		index("skill_audit_log_created_at_idx").on(table.createdAt),
	],
);

export type InsertSkillAuditLog = typeof skillAuditLog.$inferInsert;
export type SelectSkillAuditLog = typeof skillAuditLog.$inferSelect;
