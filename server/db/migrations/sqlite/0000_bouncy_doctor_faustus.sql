CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`password` text NOT NULL,
	`lang` text DEFAULT 'en',
	`roles` text DEFAULT '[]' NOT NULL,
	`limits` text DEFAULT 'free',
	`cron_active` integer DEFAULT 1,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_unique` ON `accounts` (`user`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1,
	`source_id` text,
	`source_key` text,
	`options` text DEFAULT '{}',
	`tasks` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automations_owner_name_unique` ON `automations` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`checkpoint` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`subject` text,
	`from` text NOT NULL,
	`to` text NOT NULL,
	`text` text,
	`html` text,
	`date` text,
	`staging_item` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emails_owner_message_unique` ON `emails` (`owner_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`type_version` integer DEFAULT 1 NOT NULL,
	`config` text,
	`settings` text DEFAULT '{}',
	`poll_seconds` integer DEFAULT 3600,
	`max_items_per_fetch` integer DEFAULT 50,
	`last_poll` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_owner_name_unique` ON `sources` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`read` integer DEFAULT 0,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_events_owner_id_idx` ON `user_events` (`owner_id`);--> statement-breakpoint
CREATE INDEX `user_events_created_at_idx` ON `user_events` (`created_at`);