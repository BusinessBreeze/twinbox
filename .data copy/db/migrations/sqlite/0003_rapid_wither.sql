DROP TABLE `report_items`;--> statement-breakpoint
DROP TABLE `report_specs`;--> statement-breakpoint
ALTER TABLE `automations` ADD `tasks` text DEFAULT '{"multiple":false,"tasks":[]}';--> statement-breakpoint
ALTER TABLE `automations` DROP COLUMN `actions_ids`;