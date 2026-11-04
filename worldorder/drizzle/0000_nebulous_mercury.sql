CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_user` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_owner_updated` ON `rooms` (`owner_user`,`updated_at`);