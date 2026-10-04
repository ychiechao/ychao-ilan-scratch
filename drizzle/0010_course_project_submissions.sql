ALTER TABLE `class_courses` ADD `assignment_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `course_project_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_course_id` text NOT NULL,
	`student_id` text NOT NULL,
	`project_url` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_course_id`) REFERENCES `class_courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_project_submissions_course_student_idx` ON `course_project_submissions` (`class_course_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX `course_project_submissions_student_idx` ON `course_project_submissions` (`student_id`,`updated_at`);
--> statement-breakpoint
UPDATE `classes` SET `submission_url` = '', `submission_label` = '宜蘭 Scratch 作品';
