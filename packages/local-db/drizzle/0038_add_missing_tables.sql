CREATE TABLE IF NOT EXISTS `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`scope` text NOT NULL,
	`project_id` text,
	`category` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memories_scope_idx` ON `memories` (`scope`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memories_project_id_idx` ON `memories` (`project_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_comments_task_id_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`organization_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_labels_org_id_idx` ON `task_labels` (`organization_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_subtasks_task_id_idx` ON `task_subtasks` (`task_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived_at` text;