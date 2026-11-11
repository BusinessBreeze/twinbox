ALTER TABLE `sources` ADD `state` text DEFAULT '{}';--> statement-breakpoint
-- Keep the existing checkpoints: they become the IMAP type's state, { "checkpoints": { "<key>": {...} } }
UPDATE `sources` SET `state` = json_object('checkpoints', (
	SELECT json_group_object(`c`.`id`, json(`c`.`checkpoint`)) FROM `checkpoints` `c` WHERE `c`.`source_id` = `sources`.`id`
)) WHERE `id` IN (SELECT DISTINCT `source_id` FROM `checkpoints`);--> statement-breakpoint
DROP TABLE `checkpoints`;
