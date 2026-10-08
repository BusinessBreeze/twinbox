CREATE UNIQUE INDEX `connections_imap_owner_name_unique` ON `connections_imap` (`owner_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `imap_searches_owner_name_unique` ON `imap_searches` (`owner_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `llm_create_artifacts_owner_name_unique` ON `llm_create_artifacts` (`owner_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `llm_filters_owner_name_unique` ON `llm_filters` (`owner_id`,`name`);