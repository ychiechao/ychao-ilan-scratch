DROP INDEX IF EXISTS `students_email_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `students_firebase_uid_idx`;
--> statement-breakpoint
CREATE INDEX `students_email_idx` ON `students` (`email`);
--> statement-breakpoint
CREATE INDEX `students_firebase_uid_idx` ON `students` (`firebase_uid`) WHERE `firebase_uid` IS NOT NULL;
