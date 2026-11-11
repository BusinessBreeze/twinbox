ALTER TABLE `emails` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `size` integer;--> statement-breakpoint
ALTER TABLE `emails` ADD `content` text;--> statement-breakpoint
UPDATE `emails` SET `thread_id` = `message_id`, `content` = json_object(
	'envelope', json_object(
		'from', json_array(json_object('name', NULL, 'address', `from`)),
		'to', CASE WHEN `to` IS NULL OR `to` = '' THEN json_array() ELSE json_array(json_object('name', NULL, 'address', `to`)) END,
		'cc', json_array(),
		'reply_to', json_array(),
		'subject', coalesce(`subject`, ''),
		'date', `date`,
		'message_id', `message_id`
	),
	'renditions', CASE
		WHEN `html` IS NOT NULL AND trim(`html`) <> '' THEN json_array(json_object('mime', 'text/html', 'size', length(CAST(`html` AS BLOB)), 'content', `html`))
		WHEN `text` IS NOT NULL AND trim(`text`) <> '' THEN json_array(json_object('mime', 'text/plain', 'size', length(CAST(`text` AS BLOB)), 'content', `text`))
		ELSE json_array()
	END,
	'parts', json_array(),
	'embedded', json_array()
);--> statement-breakpoint
ALTER TABLE `emails` DROP COLUMN `html`;
