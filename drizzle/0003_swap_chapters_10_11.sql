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
