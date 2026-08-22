import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
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

export function getSubmissionsBucket() {
  if (!env.SUBMISSIONS) {
    throw new Error("Cloudflare R2 binding `SUBMISSIONS` is unavailable.");
  }

  return env.SUBMISSIONS;
}

const createStatements = [
  `CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    seat_no TEXT NOT NULL,
    nickname TEXT NOT NULL,
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
  `CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacher_id)`,
  `CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id)`,
  `CREATE INDEX IF NOT EXISTS submissions_student_idx ON submissions (student_id)`,
  `CREATE INDEX IF NOT EXISTS badges_student_idx ON badges (student_id)`,
];

export async function ensureDb() {
  const db = getD1();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  return db;
}
