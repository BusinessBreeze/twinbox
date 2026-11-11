ALTER TABLE `user_events` ADD `category` text;--> statement-breakpoint
UPDATE `user_events` SET `category` = 'automation' WHERE `message` IN ('events.user.info_automation_start', 'events.user.info_automation_end', 'events.user.warn_automation_failed', 'events.user.warn_automation_delivery_failed', 'events.user.warn_llm_answer_cut');--> statement-breakpoint
UPDATE `user_events` SET `category` = 'queue' WHERE `message` IN ('events.user.warn_automation_already_active', 'events.user.error_queue_full');--> statement-breakpoint
UPDATE `user_events` SET `category` = 'source' WHERE `message` LIKE 'events.user.%source%';--> statement-breakpoint
UPDATE `user_events` SET `category` = 'notification' WHERE `message` LIKE 'events.notification.%';--> statement-breakpoint
ALTER TABLE `automations` ADD `last_run_at` integer;--> statement-breakpoint
ALTER TABLE `automations` ADD `last_issue_at` integer;--> statement-breakpoint
ALTER TABLE `automations` ADD `last_issue_level` text;--> statement-breakpoint
UPDATE `automations` SET `last_run_at` = (
	SELECT max(e.`created_at`) FROM `user_events` e
	WHERE e.`message` IN ('events.user.info_automation_start', 'events.user.info_automation_end')
	AND json_extract(e.`metadata`, '$.id') = `automations`.`id`
);--> statement-breakpoint
UPDATE `automations` SET
	`last_issue_at` = (
		SELECT e.`created_at` FROM `user_events` e
		WHERE e.`category` = 'automation' AND e.`level` IN ('warn', 'warning', 'error') AND e.`owner_id` = `automations`.`owner_id`
		AND (json_extract(e.`metadata`, '$.id') = `automations`.`id` OR (json_extract(e.`metadata`, '$.id') IS NULL AND json_extract(e.`metadata`, '$.name') = `automations`.`name`))
		ORDER BY e.`created_at` DESC LIMIT 1
	),
	`last_issue_level` = (
		SELECT CASE e.`level` WHEN 'error' THEN 'error' ELSE 'warn' END FROM `user_events` e
		WHERE e.`category` = 'automation' AND e.`level` IN ('warn', 'warning', 'error') AND e.`owner_id` = `automations`.`owner_id`
		AND (json_extract(e.`metadata`, '$.id') = `automations`.`id` OR (json_extract(e.`metadata`, '$.id') IS NULL AND json_extract(e.`metadata`, '$.name') = `automations`.`name`))
		ORDER BY e.`created_at` DESC LIMIT 1
	);
