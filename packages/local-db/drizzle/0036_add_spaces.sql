CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `projects_space_id_idx` ON `projects` (`space_id`);