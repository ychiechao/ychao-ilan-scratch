import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

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
  `CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    status TEXT NOT NULL DEFAULT 'pending',
    must_change_pin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    submission_url TEXT NOT NULL DEFAULT '',
    submission_label TEXT NOT NULL DEFAULT '作品繳交連結',
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
    pin_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    UNIQUE (class_id, seat_no)
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
  `CREATE TABLE IF NOT EXISTS app_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacher_id)`,
  `CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id)`,
  `CREATE INDEX IF NOT EXISTS submissions_student_idx ON submissions (student_id)`,
  `CREATE INDEX IF NOT EXISTS badges_student_idx ON badges (student_id)`,
  `CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id)`,
];

export async function ensureDb() {
  const db = getD1();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  const studentColumns = await db.prepare("PRAGMA table_info(students)").all<{ name: string }>();
  if (!(studentColumns.results ?? []).some((column) => column.name === "email")) {
    await db.prepare("ALTER TABLE students ADD email TEXT").run();
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS students_email_idx ON students (email)").run();
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
  return db;
}
