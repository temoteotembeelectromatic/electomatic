CREATE TABLE `cash_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`project` text,
	`counterparty` text NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	`file_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_movements_file_id_unique` ON `cash_movements` (`file_id`);