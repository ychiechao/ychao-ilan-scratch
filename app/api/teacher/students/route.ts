import { ensureDb } from "../../../../db";
import { cleanText, createId, hashPin, isValidEmail, jsonError, normalizeEmail } from "../../_lib";

async function ownedActiveClass(db: D1Database, teacherId: string, classId: string) {
  return db
    .prepare(
      `SELECT c.id FROM classes c JOIN teachers t ON t.id = c.teacher_id
       WHERE c.id = ? AND c.teacher_id = ? AND c.status = 'active' AND t.status = 'active'`
    )
    .bind(classId, teacherId)
    .first();
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    teacherId?: string; classId?: string; seatNo?: string; nickname?: string; email?: string; pin?: string;
  } | null;
  const teacherId = cleanText(payload?.teacherId, 80);
  const classId = cleanText(payload?.classId, 80);
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(payload?.email);
  const pin = cleanText(payload?.pin, 12);
  if (!teacherId || !classId || !seatNo || !nickname || !isValidEmail(email) || pin.length < 4) return jsonError("請輸入座號、暱稱、正確的 Email 與至少 4 碼 PIN。");

  const db = await ensureDb();
  if (!(await ownedActiveClass(db, teacherId, classId))) return jsonError("班級尚未啟用，或你沒有這個班級的管理權。", 403);
  try {
    await db
      .prepare("INSERT INTO students (id, class_id, seat_no, nickname, email, pin_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(createId("stu"), classId, seatNo, nickname, email, await hashPin(`${classId}:${seatNo}`, pin))
      .run();
  } catch {
    return jsonError("這個座號或 Email 已經存在。");
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    teacherId?: string; classId?: string; studentId?: string; seatNo?: string; nickname?: string; email?: string; pin?: string;
  } | null;
  const teacherId = cleanText(payload?.teacherId, 80);
  const classId = cleanText(payload?.classId, 80);
  const studentId = cleanText(payload?.studentId, 80);
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(payload?.email);
  const pin = cleanText(payload?.pin, 12);
  if (!teacherId || !classId || !studentId || !seatNo || !nickname || !isValidEmail(email) || pin.length < 4) return jsonError("編輯學生時請一併設定 Email 與至少 4 碼的新 PIN。");

  const db = await ensureDb();
  if (!(await ownedActiveClass(db, teacherId, classId))) return jsonError("無這個班級的管理權。", 403);
  try {
    const result = await db
      .prepare("UPDATE students SET seat_no = ?, nickname = ?, email = ?, pin_hash = ? WHERE id = ? AND class_id = ?")
      .bind(seatNo, nickname, email, await hashPin(`${classId}:${seatNo}`, pin), studentId, classId)
      .run();
    if (!result.meta.changes) return jsonError("找不到學生。", 404);
  } catch {
    return jsonError("這個座號或 Email 已經存在。");
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const payload = (await request.json().catch(() => null)) as { teacherId?: string; classId?: string; studentId?: string } | null;
  const teacherId = cleanText(payload?.teacherId, 80);
  const classId = cleanText(payload?.classId, 80);
  const studentId = cleanText(payload?.studentId, 80);
  const db = await ensureDb();
  if (!(await ownedActiveClass(db, teacherId, classId))) return jsonError("無這個班級的管理權。", 403);
  const student = await db.prepare("SELECT id FROM students WHERE id = ? AND class_id = ?").bind(studentId, classId).first();
  if (!student) return jsonError("找不到學生。", 404);
  await db.batch([
    db.prepare("DELETE FROM badges WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM submissions WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM students WHERE id = ?").bind(studentId),
  ]);
  return Response.json({ ok: true });
}
