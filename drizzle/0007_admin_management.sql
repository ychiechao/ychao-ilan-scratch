ALTER TABLE teachers ADD COLUMN school_name TEXT NOT NULL DEFAULT '';
ALTER TABLE teachers ADD COLUMN last_login_at TEXT;
ALTER TABLE teachers ADD COLUMN last_active_at TEXT;

ALTER TABLE students ADD COLUMN school_name TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE students ADD COLUMN last_login_at TEXT;
ALTER TABLE students ADD COLUMN last_active_at TEXT;

CREATE TABLE teacher_course_permissions (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (updated_by) REFERENCES teachers(id),
  UNIQUE (teacher_id, course_id)
);

CREATE TABLE user_activity_logs (
  id TEXT PRIMARY KEY,
  user_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX teacher_course_permissions_teacher_idx ON teacher_course_permissions(teacher_id, course_id);
CREATE INDEX user_activity_logs_user_idx ON user_activity_logs(user_type, user_id, created_at);
CREATE INDEX user_activity_logs_created_idx ON user_activity_logs(created_at);
