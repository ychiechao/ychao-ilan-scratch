ALTER TABLE `teachers` ADD `role` text DEFAULT 'teacher' NOT NULL;
--> statement-breakpoint
ALTER TABLE `teachers` ADD `status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `teachers` ADD `must_change_pin` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `teachers` SET `status` = 'active';
--> statement-breakpoint
UPDATE `teachers` SET `role` = 'superadmin', `status` = 'active' WHERE lower(`email`) = 'ychao.ilc@smail.ilc.edu.tw';
--> statement-breakpoint
ALTER TABLE `classes` ADD `status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `classes` ADD `reviewed_at` text;
--> statement-breakpoint
UPDATE `classes` SET `status` = 'active', `reviewed_at` = CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `admin_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`admin_id`) REFERENCES `teachers`(`id`)
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_admin_idx` ON `admin_sessions` (`admin_id`);
