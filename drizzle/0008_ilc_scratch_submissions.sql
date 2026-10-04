ALTER TABLE `submissions` ADD `project_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `classes`
SET `submission_url` = 'https://s3.ilc.edu.tw/',
    `submission_label` = '宜蘭 Scratch 作品'
WHERE `submission_url` = ''
   OR `submission_url` LIKE '%drive.google.com%'
   OR `submission_url` LIKE '%docs.google.com/forms%'
   OR `submission_url` LIKE '%forms.gle%';
