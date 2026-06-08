CREATE TABLE `memory_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`workspace_id` text,
	`agent_activity_id` text,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'open' NOT NULL,
	`r_human` real,
	`r_goal_achievement` real,
	`r_process_quality` real,
	`r_user_satisfaction` real,
	`topic_signature` text,
	`trace_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_activity_id`) REFERENCES `agent_activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `memory_episodes_project_id_idx` ON `memory_episodes` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_episodes_status_idx` ON `memory_episodes` (`status`);--> statement-breakpoint
CREATE INDEX `memory_episodes_created_at_idx` ON `memory_episodes` (`created_at`);--> statement-breakpoint
CREATE INDEX `memory_episodes_agent_activity_id_idx` ON `memory_episodes` (`agent_activity_id`);--> statement-breakpoint
CREATE TABLE `memory_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`trigger` text NOT NULL,
	`procedure` text NOT NULL,
	`verification` text,
	`boundary` text,
	`experience_type` text DEFAULT 'preference' NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`support` integer DEFAULT 1 NOT NULL,
	`gain` real,
	`decision_guidance` text,
	`category` text,
	`scope` text DEFAULT 'global' NOT NULL,
	`vec_summary` text,
	`source_trace_ids` text,
	`source_episode_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_policies_project_id_idx` ON `memory_policies` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_policies_status_idx` ON `memory_policies` (`status`);--> statement-breakpoint
CREATE INDEX `memory_policies_experience_type_idx` ON `memory_policies` (`experience_type`);--> statement-breakpoint
CREATE INDEX `memory_policies_scope_idx` ON `memory_policies` (`scope`);--> statement-breakpoint
CREATE INDEX `memory_policies_category_idx` ON `memory_policies` (`category`);--> statement-breakpoint
CREATE TABLE `memory_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`invocation_guide` text NOT NULL,
	`procedure_json` text,
	`eta` real DEFAULT 0 NOT NULL,
	`trials_attempted` integer DEFAULT 0 NOT NULL,
	`trials_passed` integer DEFAULT 0 NOT NULL,
	`evidence_anchors` text,
	`status` text DEFAULT 'candidate' NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`vec_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_skills_project_id_idx` ON `memory_skills` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_skills_status_idx` ON `memory_skills` (`status`);--> statement-breakpoint
CREATE INDEX `memory_skills_scope_idx` ON `memory_skills` (`scope`);--> statement-breakpoint
CREATE INDEX `memory_skills_eta_idx` ON `memory_skills` (`eta`);--> statement-breakpoint
CREATE TABLE `memory_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`project_id` text,
	`turn_index` integer NOT NULL,
	`user_text` text,
	`agent_text` text,
	`tool_calls` text,
	`agent_thinking` text,
	`reflection` text,
	`value` real,
	`alpha` real,
	`priority` real,
	`tags` text,
	`error_signatures` text,
	`vec_summary` text,
	`vec_action` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `memory_episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_traces_episode_id_idx` ON `memory_traces` (`episode_id`);--> statement-breakpoint
CREATE INDEX `memory_traces_project_id_idx` ON `memory_traces` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_traces_priority_idx` ON `memory_traces` (`priority`);--> statement-breakpoint
CREATE INDEX `memory_traces_created_at_idx` ON `memory_traces` (`created_at`);--> statement-breakpoint
CREATE TABLE `memory_world_models` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`model_type` text NOT NULL,
	`content` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`domain_tags` text,
	`scope` text DEFAULT 'global' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_policy_ids` text,
	`vec_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_world_models_project_id_idx` ON `memory_world_models` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_world_models_model_type_idx` ON `memory_world_models` (`model_type`);--> statement-breakpoint
CREATE INDEX `memory_world_models_status_idx` ON `memory_world_models` (`status`);--> statement-breakpoint
CREATE INDEX `memory_world_models_scope_idx` ON `memory_world_models` (`scope`);--> statement-breakpoint
ALTER TABLE `agent_activities` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `agent_activities_archived_at_idx` ON `agent_activities` (`archived_at`);