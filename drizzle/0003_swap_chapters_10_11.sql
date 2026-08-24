CREATE TABLE IF NOT EXISTS `app_migrations` (
  `id` text PRIMARY KEY NOT NULL,
  `applied_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
UPDATE `submissions` SET `chapter_no` = 110 WHERE `chapter_no` = 10;
--> statement-breakpoint
UPDATE `submissions` SET `chapter_no` = 10 WHERE `chapter_no` = 11;
--> statement-breakpoint
UPDATE `submissions` SET `chapter_no` = 11 WHERE `chapter_no` = 110;
--> statement-breakpoint
UPDATE `badges` SET `chapter_no` = 110 WHERE `chapter_no` = 10;
--> statement-breakpoint
UPDATE `badges` SET `chapter_no` = 10 WHERE `chapter_no` = 11;
--> statement-breakpoint
UPDATE `badges` SET `chapter_no` = 11 WHERE `chapter_no` = 110;
--> statement-breakpoint
UPDATE `badges` SET `badge_name` = '遊戲裁判' WHERE `chapter_no` = 10;
--> statement-breakpoint
UPDATE `badges` SET `badge_name` = '時間挑戰者' WHERE `chapter_no` = 11;
--> statement-breakpoint
INSERT OR IGNORE INTO `app_migrations` (`id`) VALUES ('swap-chapters-10-11');
