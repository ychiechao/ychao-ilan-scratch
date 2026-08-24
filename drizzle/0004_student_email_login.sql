ALTER TABLE `students` ADD `email` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `students_email_idx` ON `students` (`email`);
