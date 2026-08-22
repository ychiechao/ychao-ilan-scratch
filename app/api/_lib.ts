import { chapters } from "../course-data";
import { ensureDb } from "../../db";

export type ClassRow = {
  id: string;
  teacher_id: string;
  name: string;
  code: string;
  created_at: string;
};

export type StudentRow = {
  id: string;
  class_id: string;
  seat_no: string;
  nickname: string;
  pin_hash: string;
  created_at: string;
};

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function normalizeClassCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function cleanText(value: unknown, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export async function hashPin(scope: string, pin: string) {
  const data = new TextEncoder().encode(`${scope}:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateClassCode() {
  const db = await ensureDb();
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let suffix = "";
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    for (const byte of bytes) {
      suffix += letters[byte % letters.length];
    }
    const code = `YL-${suffix}`;
    const existing = await db
      .prepare("SELECT id FROM classes WHERE code = ?")
      .bind(code)
      .first();

    if (!existing) {
      return code;
    }
  }

  throw new Error("無法產生班級代碼，請再試一次。");
}

export function publicClass(row: ClassRow) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
  };
}

export function publicStudent(row: StudentRow) {
  return {
    id: row.id,
    classId: row.class_id,
    seatNo: row.seat_no,
    nickname: row.nickname,
    createdAt: row.created_at,
  };
}

export function getChapter(chapterNo: number) {
  return chapters.find((chapter) => chapter.no === chapterNo);
}

export function scoreChecklist(chapterNo: number, checkedIds: string[]) {
  const chapter = getChapter(chapterNo);
  if (!chapter) {
    return { score: 0, passed: false, missing: ["找不到章節。"] };
  }

  const checked = new Set(checkedIds);
  const missing = chapter.checks
    .filter((item) => !checked.has(item.id))
    .map((item) => item.label);
  const score = Math.round(
    ((chapter.checks.length - missing.length) / chapter.checks.length) * 100
  );

  return { score, passed: missing.length === 0, missing };
}

export async function getStudentProgress(studentId: string) {
  const db = await ensureDb();
  const submissions = await db
    .prepare(
      `SELECT id, student_id, chapter_no, file_name, file_size, checklist_json,
        auto_score, status, feedback, created_at, updated_at
       FROM submissions
       WHERE student_id = ?
       ORDER BY chapter_no ASC`
    )
    .bind(studentId)
    .all();
  const badges = await db
    .prepare(
      `SELECT id, student_id, chapter_no, badge_name, earned_at
       FROM badges
       WHERE student_id = ?
       ORDER BY chapter_no ASC`
    )
    .bind(studentId)
    .all();

  return {
    submissions: submissions.results ?? [],
    badges: badges.results ?? [],
  };
}
