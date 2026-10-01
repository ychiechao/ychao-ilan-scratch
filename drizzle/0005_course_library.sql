ALTER TABLE teachers ADD COLUMN firebase_uid TEXT;
ALTER TABLE students ADD COLUMN firebase_uid TEXT;
CREATE UNIQUE INDEX teachers_firebase_uid_idx ON teachers(firebase_uid) WHERE firebase_uid IS NOT NULL;
CREATE UNIQUE INDEX students_firebase_uid_idx ON students(firebase_uid) WHERE firebase_uid IS NOT NULL;

CREATE TABLE courses (
  id TEXT PRIMARY KEY, owner_teacher_id TEXT NOT NULL, title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '', school_year TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '', education_stage TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft',
  current_version_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_teacher_id) REFERENCES teachers(id)
);
CREATE TABLE course_versions (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', changelog TEXT NOT NULL DEFAULT '',
  preview_confirmed INTEGER NOT NULL DEFAULT 0, published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(course_id) REFERENCES courses(id), UNIQUE(course_id, version_no)
);
CREATE TABLE lessons (
  id TEXT PRIMARY KEY, course_version_id TEXT NOT NULL, title TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  badge_name TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(course_version_id) REFERENCES course_versions(id)
);
CREATE TABLE file_assets (
  id TEXT PRIMARY KEY, owner_teacher_id TEXT NOT NULL, r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/x.scratch.sb3', file_size INTEGER NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'reference', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_teacher_id) REFERENCES teachers(id), UNIQUE(owner_teacher_id, sha256)
);
CREATE TABLE questions (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '', difficulty TEXT NOT NULL DEFAULT 'beginner',
  estimated_minutes INTEGER NOT NULL DEFAULT 20, sort_order INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1, reference_asset_id TEXT,
  analysis_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(lesson_id) REFERENCES lessons(id),
  FOREIGN KEY(reference_asset_id) REFERENCES file_assets(id)
);
CREATE TABLE rubric_rules (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'automatic', scope TEXT NOT NULL DEFAULT 'any_sprite',
  type TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', required INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 0, pass_feedback TEXT NOT NULL DEFAULT '',
  fail_feedback TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(question_id) REFERENCES questions(id)
);
CREATE TABLE course_reviews (
  id TEXT PRIMARY KEY, course_version_id TEXT NOT NULL, reviewer_id TEXT,
  status TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(course_version_id) REFERENCES course_versions(id), FOREIGN KEY(reviewer_id) REFERENCES teachers(id)
);
CREATE TABLE class_courses (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL, course_version_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id), FOREIGN KEY(course_version_id) REFERENCES course_versions(id),
  UNIQUE(class_id, course_version_id)
);
CREATE INDEX courses_owner_idx ON courses(owner_teacher_id);
CREATE INDEX course_versions_course_idx ON course_versions(course_id);
CREATE INDEX lessons_version_idx ON lessons(course_version_id, sort_order);
CREATE INDEX questions_lesson_idx ON questions(lesson_id, sort_order);
CREATE INDEX rubric_rules_question_idx ON rubric_rules(question_id, sort_order);
CREATE INDEX course_reviews_version_idx ON course_reviews(course_version_id, created_at);
CREATE INDEX class_courses_class_idx ON class_courses(class_id, sort_order);
CREATE TABLE question_results (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_id TEXT NOT NULL,
  file_name TEXT NOT NULL, file_size INTEGER NOT NULL, analysis_json TEXT NOT NULL,
  results_json TEXT NOT NULL, score INTEGER NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id), FOREIGN KEY(question_id) REFERENCES questions(id),
  UNIQUE(student_id, question_id)
);
CREATE INDEX question_results_student_idx ON question_results(student_id, updated_at);
