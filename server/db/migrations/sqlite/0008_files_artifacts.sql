CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`filename` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_owner_sha256_unique` ON `files` (`owner_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`file_id` text NOT NULL,
	`filename` text NOT NULL,
	`automation_id` text,
	`label` text,
	`source_refs` text DEFAULT '[]',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `artifacts_owner_idx` ON `artifacts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `artifacts_file_idx` ON `artifacts` (`file_id`);
