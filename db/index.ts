import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { yilanSchools } from "./yilan-schools";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Check wrangler.jsonc or the active hosting provider's binding configuration."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return env.DB;
}

const createStatements = [
  `CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    domains_json TEXT NOT NULL DEFAULT '[]',
    division TEXT NOT NULL DEFAULT 'unclassified',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    firebase_uid TEXT,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    status TEXT NOT NULL DEFAULT 'pending',
    must_change_pin INTEGER NOT NULL DEFAULT 0,
    school_id TEXT,
    school_name TEXT NOT NULL DEFAULT '',
    last_login_at TEXT,
    last_active_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    submission_url TEXT NOT NULL DEFAULT '',
    submission_label TEXT NOT NULL DEFAULT '宜蘭 Scratch 作品',
    school_id TEXT,
    enrollment_enabled INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    seat_no TEXT NOT NULL,
    nickname TEXT NOT NULL,
    email TEXT,
    firebase_uid TEXT,
    pin_hash TEXT NOT NULL,
    school_id TEXT,
    school_name TEXT NOT NULL DEFAULT '',
    school_source TEXT NOT NULL DEFAULT 'class',
    school_verified INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at TEXT,
    last_active_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    UNIQUE (class_id, seat_no)
  )`,
  `CREATE TABLE IF NOT EXISTS teacher_school_assignments (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (school_id) REFERENCES schools(id),
    UNIQUE (teacher_id, school_id)
  )`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    chapter_no INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    checklist_json TEXT NOT NULL,
    auto_score INTEGER NOT NULL,
    status TEXT NOT NULL,
    external_status TEXT NOT NULL DEFAULT 'not_required',
    project_url TEXT NOT NULL DEFAULT '',
    feedback TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE (student_id, chapter_no)
  )`,
  `CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    chapter_no INTEGER NOT NULL,
    badge_name TEXT NOT NULL,
    earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE (student_id, chapter_no)
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES teachers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    owner_teacher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    school_year TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    education_stage TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    current_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_teacher_id) REFERENCES teachers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS course_versions (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    changelog TEXT NOT NULL DEFAULT '',
    preview_confirmed INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE (course_id, version_no)
  )`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    course_version_id TEXT NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    badge_name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (course_version_id) REFERENCES course_versions(id)
  )`,
  `CREATE TABLE IF NOT EXISTS file_assets (
    id TEXT PRIMARY KEY,
    owner_teacher_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'cloudflare_kv',
    provider_file_id TEXT,
    sha256 TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/x.scratch.sb3',
    file_size INTEGER NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'reference',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_teacher_id) REFERENCES teachers(id),
    UNIQUE (owner_teacher_id, sha256)
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'beginner',
    estimated_minutes INTEGER NOT NULL DEFAULT 20,
    sort_order INTEGER NOT NULL DEFAULT 0,
    required INTEGER NOT NULL DEFAULT 1,
    reference_asset_id TEXT,
    analysis_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (lesson_id) REFERENCES lessons(id),
    FOREIGN KEY (reference_asset_id) REFERENCES file_assets(id)
  )`,
  `CREATE TABLE IF NOT EXISTS rubric_rules (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    label TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'automatic',
    scope TEXT NOT NULL DEFAULT 'any_sprite',
    type TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    required INTEGER NOT NULL DEFAULT 1,
    weight INTEGER NOT NULL DEFAULT 0,
    pass_feedback TEXT NOT NULL DEFAULT '',
    fail_feedback TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  )`,
  `CREATE TABLE IF NOT EXISTS course_reviews (
    id TEXT PRIMARY KEY,
    course_version_id TEXT NOT NULL,
    reviewer_id TEXT,
    status TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_version_id) REFERENCES course_versions(id),
    FOREIGN KEY (reviewer_id) REFERENCES teachers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS class_courses (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    course_version_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    assignment_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (course_version_id) REFERENCES course_versions(id),
    UNIQUE (class_id, course_version_id)
  )`,
  `CREATE TABLE IF NOT EXISTS course_project_submissions (
    id TEXT PRIMARY KEY,
    class_course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    project_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_course_id) REFERENCES class_courses(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE (class_course_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS question_results (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    analysis_json TEXT NOT NULL,
    results_json TEXT NOT NULL,
    score INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (question_id) REFERENCES questions(id),
    UNIQUE (student_id, question_id)
  )`,
  `CREATE TABLE IF NOT EXISTS teacher_course_permissions (
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
  )`,
  `CREATE TABLE IF NOT EXISTS user_activity_logs (
    id TEXT PRIMARY KEY,
    user_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacher_id)`,
  `CREATE INDEX IF NOT EXISTS classes_school_idx ON classes (school_id)`,
  `CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id)`,
  `CREATE INDEX IF NOT EXISTS students_school_idx ON students (school_id)`,
  `CREATE INDEX IF NOT EXISTS teacher_school_assignments_teacher_idx ON teacher_school_assignments (teacher_id, school_id)`,
  `CREATE INDEX IF NOT EXISTS submissions_student_idx ON submissions (student_id)`,
  `CREATE INDEX IF NOT EXISTS badges_student_idx ON badges (student_id)`,
  `CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id)`,
  `CREATE INDEX IF NOT EXISTS courses_owner_idx ON courses (owner_teacher_id)`,
  `CREATE INDEX IF NOT EXISTS course_versions_course_idx ON course_versions (course_id)`,
  `CREATE INDEX IF NOT EXISTS lessons_version_idx ON lessons (course_version_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS questions_lesson_idx ON questions (lesson_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS rubric_rules_question_idx ON rubric_rules (question_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS course_reviews_version_idx ON course_reviews (course_version_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS class_courses_class_idx ON class_courses (class_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS course_project_submissions_student_idx ON course_project_submissions (student_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS question_results_student_idx ON question_results (student_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS teacher_course_permissions_teacher_idx ON teacher_course_permissions (teacher_id, course_id)`,
  `CREATE INDEX IF NOT EXISTS user_activity_logs_user_idx ON user_activity_logs (user_type, user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS user_activity_logs_created_idx ON user_activity_logs (created_at)`,
];

export async function ensureDb() {
  const db = getD1();
  const teacherColumns = await db.prepare("PRAGMA table_info(teachers)").all<{ name: string }>();
  if ((teacherColumns.results ?? []).length > 0 && !(teacherColumns.results ?? []).some((column) => column.name === "firebase_uid")) {
    await db.prepare("ALTER TABLE teachers ADD firebase_uid TEXT").run();
  }
  if ((teacherColumns.results ?? []).length > 0 && !(teacherColumns.results ?? []).some((column) => column.name === "school_name")) {
    await db.prepare("ALTER TABLE teachers ADD school_name TEXT NOT NULL DEFAULT ''").run();
  }
  if ((teacherColumns.results ?? []).length > 0 && !(teacherColumns.results ?? []).some((column) => column.name === "school_id")) {
    await db.prepare("ALTER TABLE teachers ADD school_id TEXT").run();
  }
  if ((teacherColumns.results ?? []).length > 0 && !(teacherColumns.results ?? []).some((column) => column.name === "last_login_at")) {
    await db.prepare("ALTER TABLE teachers ADD last_login_at TEXT").run();
  }
  if ((teacherColumns.results ?? []).length > 0 && !(teacherColumns.results ?? []).some((column) => column.name === "last_active_at")) {
    await db.prepare("ALTER TABLE teachers ADD last_active_at TEXT").run();
  }
  const classColumns = await db.prepare("PRAGMA table_info(classes)").all<{ name: string }>();
  if ((classColumns.results ?? []).length > 0 && !(classColumns.results ?? []).some((column) => column.name === "enrollment_enabled")) {
    await db.prepare("ALTER TABLE classes ADD enrollment_enabled INTEGER NOT NULL DEFAULT 1").run();
  }
  if ((classColumns.results ?? []).length > 0 && !(classColumns.results ?? []).some((column) => column.name === "school_id")) {
    await db.prepare("ALTER TABLE classes ADD school_id TEXT").run();
  }
  if ((classColumns.results ?? []).length > 0 && !(classColumns.results ?? []).some((column) => column.name === "archived")) {
    await db.prepare("ALTER TABLE classes ADD archived INTEGER NOT NULL DEFAULT 0").run();
  }
  const studentColumns = await db.prepare("PRAGMA table_info(students)").all<{ name: string }>();
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "email")) {
    await db.prepare("ALTER TABLE students ADD email TEXT").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "firebase_uid")) {
    await db.prepare("ALTER TABLE students ADD firebase_uid TEXT").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "school_name")) {
    await db.prepare("ALTER TABLE students ADD school_name TEXT NOT NULL DEFAULT ''").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "school_id")) {
    await db.prepare("ALTER TABLE students ADD school_id TEXT").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "school_source")) {
    await db.prepare("ALTER TABLE students ADD school_source TEXT NOT NULL DEFAULT 'class'").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "school_verified")) {
    await db.prepare("ALTER TABLE students ADD school_verified INTEGER NOT NULL DEFAULT 0").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "status")) {
    await db.prepare("ALTER TABLE students ADD status TEXT NOT NULL DEFAULT 'active'").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "last_login_at")) {
    await db.prepare("ALTER TABLE students ADD last_login_at TEXT").run();
  }
  if ((studentColumns.results ?? []).length > 0 && !(studentColumns.results ?? []).some((column) => column.name === "last_active_at")) {
    await db.prepare("ALTER TABLE students ADD last_active_at TEXT").run();
  }
  const submissionColumns = await db.prepare("PRAGMA table_info(submissions)").all<{ name: string }>();
  if ((submissionColumns.results ?? []).length > 0 && !(submissionColumns.results ?? []).some((column) => column.name === "project_url")) {
    await db.prepare("ALTER TABLE submissions ADD project_url TEXT NOT NULL DEFAULT ''").run();
  }
  const classCourseColumns = await db.prepare("PRAGMA table_info(class_courses)").all<{ name: string }>();
  if ((classCourseColumns.results ?? []).length > 0 && !(classCourseColumns.results ?? []).some((column) => column.name === "assignment_enabled")) {
    await db.prepare("ALTER TABLE class_courses ADD assignment_enabled INTEGER NOT NULL DEFAULT 0").run();
  }
  const assetColumns = await db.prepare("PRAGMA table_info(file_assets)").all<{ name: string }>();
  if ((assetColumns.results ?? []).length > 0 && !(assetColumns.results ?? []).some((column) => column.name === "storage_provider")) {
    await db.prepare("ALTER TABLE file_assets ADD storage_provider TEXT NOT NULL DEFAULT 'cloudflare_kv'").run();
  }
  if ((assetColumns.results ?? []).length > 0 && !(assetColumns.results ?? []).some((column) => column.name === "provider_file_id")) {
    await db.prepare("ALTER TABLE file_assets ADD provider_file_id TEXT").run();
    await db.prepare("UPDATE file_assets SET storage_provider = 'r2', provider_file_id = r2_key WHERE provider_file_id IS NULL").run();
  }
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  await db.prepare("CREATE INDEX IF NOT EXISTS students_email_idx ON students (email)").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS teachers_firebase_uid_idx ON teachers (firebase_uid) WHERE firebase_uid IS NOT NULL").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS students_firebase_uid_idx ON students (firebase_uid) WHERE firebase_uid IS NOT NULL").run();
  const chapterSwap = await db
    .prepare("SELECT id FROM app_migrations WHERE id = 'swap-chapters-10-11'")
    .first();
  if (!chapterSwap) {
    await db.batch([
      db.prepare("UPDATE submissions SET chapter_no = 110 WHERE chapter_no = 10"),
      db.prepare("UPDATE submissions SET chapter_no = 10 WHERE chapter_no = 11"),
      db.prepare("UPDATE submissions SET chapter_no = 11 WHERE chapter_no = 110"),
      db.prepare("UPDATE badges SET chapter_no = 110 WHERE chapter_no = 10"),
      db.prepare("UPDATE badges SET chapter_no = 10 WHERE chapter_no = 11"),
      db.prepare("UPDATE badges SET chapter_no = 11 WHERE chapter_no = 110"),
      db.prepare("UPDATE badges SET badge_name = '遊戲裁判' WHERE chapter_no = 10"),
      db.prepare("UPDATE badges SET badge_name = '時間挑戰者' WHERE chapter_no = 11"),
      db.prepare("INSERT INTO app_migrations (id) VALUES ('swap-chapters-10-11')"),
    ]);
  }
  const schoolCatalog = await db
    .prepare("SELECT id FROM app_migrations WHERE id = 'seed-yilan-schools-2026'")
    .first();
  if (!schoolCatalog) {
    await db.batch([
      ...yilanSchools.map((school) => db.prepare(
        `INSERT INTO schools (id, name, division, enabled) VALUES (?, ?, ?, 1)
         ON CONFLICT(name) DO UPDATE SET division = excluded.division, enabled = 1, updated_at = CURRENT_TIMESTAMP`
      ).bind(school.id, school.name, school.division)),
      db.prepare("INSERT OR IGNORE INTO app_migrations (id) VALUES ('seed-yilan-schools-2026')"),
    ]);
  }
  return db;
}
