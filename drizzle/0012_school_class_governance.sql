CREATE TABLE `schools` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `domains_json` text DEFAULT '[]' NOT NULL,
  `division` text DEFAULT 'unclassified' NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `schools_name_idx` ON `schools` (`name`);

ALTER TABLE `teachers` ADD `school_id` text;
ALTER TABLE `classes` ADD `school_id` text;
ALTER TABLE `classes` ADD `archived` integer DEFAULT 0 NOT NULL;
ALTER TABLE `students` ADD `school_id` text;
ALTER TABLE `students` ADD `school_source` text DEFAULT 'class' NOT NULL;
ALTER TABLE `students` ADD `school_verified` integer DEFAULT 0 NOT NULL;

CREATE TABLE `teacher_school_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `school_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`),
  UNIQUE (`teacher_id`, `school_id`)
);

INSERT OR IGNORE INTO `schools` (`id`, `name`)
SELECT 'school_' || lower(hex(randomblob(8))), school_name
FROM (
  SELECT trim(school_name) AS school_name FROM teachers WHERE trim(school_name) <> ''
  UNION
  SELECT trim(school_name) AS school_name FROM students WHERE trim(school_name) <> ''
) GROUP BY school_name;

UPDATE teachers SET school_id = (SELECT id FROM schools WHERE schools.name = teachers.school_name)
WHERE trim(school_name) <> '' AND school_id IS NULL;
UPDATE classes SET school_id = (SELECT school_id FROM teachers WHERE teachers.id = classes.teacher_id)
WHERE school_id IS NULL;
UPDATE students SET school_id = (SELECT school_id FROM classes WHERE classes.id = students.class_id),
  school_source = 'class', school_verified = 1
WHERE school_id IS NULL AND EXISTS (SELECT 1 FROM classes WHERE classes.id = students.class_id AND classes.school_id IS NOT NULL);

INSERT OR IGNORE INTO teacher_school_assignments (id, teacher_id, school_id)
SELECT 'tsa_' || lower(hex(randomblob(8))), id, school_id FROM teachers WHERE school_id IS NOT NULL;

CREATE INDEX `classes_school_idx` ON `classes` (`school_id`);
CREATE INDEX `students_school_idx` ON `students` (`school_id`);
CREATE INDEX `teacher_school_assignments_teacher_idx` ON `teacher_school_assignments` (`teacher_id`, `school_id`);
