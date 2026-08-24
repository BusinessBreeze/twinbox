DROP INDEX `emails_message_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `emails_owner_message_unique` ON `emails` (`owner_id`,`message_id`);