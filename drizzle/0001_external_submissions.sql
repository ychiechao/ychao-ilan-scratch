ALTER TABLE `classes` ADD `submission_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `classes` ADD `submission_label` text DEFAULT '作品繳交連結' NOT NULL;
--> statement-breakpoint
ALTER TABLE `submissions` ADD `external_status` text DEFAULT 'not_required' NOT NULL;
