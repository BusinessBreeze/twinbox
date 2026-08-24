CREATE TABLE `llm_create_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `accounts_email_unique`;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `email`;