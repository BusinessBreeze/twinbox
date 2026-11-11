ALTER TABLE `emails` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `retention_days` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sources` ADD `max_items` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sources` ADD `max_size_mb` integer DEFAULT 0;