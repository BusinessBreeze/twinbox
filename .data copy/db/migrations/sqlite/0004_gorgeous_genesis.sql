CREATE TABLE `user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_events_owner_id_idx` ON `user_events` (`owner_id`);--> statement-breakpoint
CREATE INDEX `user_events_created_at_idx` ON `user_events` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_automations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`imap_connection_id` text NOT NULL,
	`imap_folder` text NOT NULL,
	`search_id` text,
	`llm_filter_id` text,
	`tasks` text DEFAULT '{"multiple":false,"tasks":[]}',
	`poll_seconds` integer DEFAULT 3600,
	`last_poll` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_automations`("id", "owner_id", "name", "imap_connection_id", "imap_folder", "search_id", "llm_filter_id", "tasks", "poll_seconds", "last_poll", "created_at", "updated_at") SELECT "id", "owner_id", "name", "imap_connection_id", "imap_folder", "search_id", "llm_filter_id", "tasks", "poll_seconds", "last_poll", "created_at", "updated_at" FROM `automations`;--> statement-breakpoint
DROP TABLE `automations`;--> statement-breakpoint
ALTER TABLE `__new_automations` RENAME TO `automations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;