CREATE TABLE `agent_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`tab_id` text,
	`pane_id` text,
	`tab_name` text,
	`preset_name` text,
	`model_name` text,
	`branch` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`title` text,
	`summary` text,
	`user_message` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_activities_workspace_id_idx` ON `agent_activities` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_activities_project_id_idx` ON `agent_activities` (`project_id`);--> statement-breakpoint
CREATE INDEX `agent_activities_branch_idx` ON `agent_activities` (`branch`);--> statement-breakpoint
CREATE INDEX `agent_activities_status_idx` ON `agent_activities` (`status`);--> statement-breakpoint
CREATE INDEX `agent_activities_started_at_idx` ON `agent_activities` (`started_at`);--> statement-breakpoint
CREATE TABLE `skill_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`skill_id` text,
	`skill_name` text,
	`tool` text,
	`detail` text,
	`success` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skill_audit_log_action_idx` ON `skill_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `skill_audit_log_created_at_idx` ON `skill_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `skill_preset_skills` (
	`preset_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `skill_presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_preset_skills_preset_id_idx` ON `skill_preset_skills` (`preset_id`);--> statement-breakpoint
CREATE INDEX `skill_preset_skills_skill_id_idx` ON `skill_preset_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `skill_preset_tool_toggles` (
	`preset_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`tool` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `skill_presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_preset_tool_toggles_preset_id_idx` ON `skill_preset_tool_toggles` (`preset_id`);--> statement-breakpoint
CREATE INDEX `skill_preset_tool_toggles_skill_id_idx` ON `skill_preset_tool_toggles` (`skill_id`);--> statement-breakpoint
CREATE TABLE `skill_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `skill_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`tool` text NOT NULL,
	`target_path` text NOT NULL,
	`mode` text DEFAULT 'symlink' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`synced_at` integer,
	`source_hash` text,
	`last_error` text,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_targets_skill_id_idx` ON `skill_targets` (`skill_id`);--> statement-breakpoint
CREATE INDEX `skill_targets_tool_idx` ON `skill_targets` (`tool`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_type` text NOT NULL,
	`source_ref` text,
	`source_ref_resolved` text,
	`source_subpath` text,
	`source_branch` text,
	`source_revision` text,
	`remote_revision` text,
	`update_status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`last_check_error` text,
	`central_path` text NOT NULL,
	`content_hash` text,
	`enabled` integer DEFAULT true NOT NULL,
	`tags` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_central_path_unique` ON `skills` (`central_path`);--> statement-breakpoint
CREATE INDEX `skills_source_type_idx` ON `skills` (`source_type`);--> statement-breakpoint
CREATE INDEX `skills_central_path_idx` ON `skills` (`central_path`);--> statement-breakpoint
CREATE INDEX `skills_update_status_idx` ON `skills` (`update_status`);