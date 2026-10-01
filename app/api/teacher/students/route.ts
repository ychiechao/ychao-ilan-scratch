import { ensureDb } from "../../../../db";
import { cleanText, createId, hashPin, isValidEmail, jsonError, normalizeEmail } from "../../_lib";
import { requireTeacher } from "../../auth";

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
    teacherId?: string; classId?: string; seatNo?: string; nickname?: string; email?: string;
  } | null;
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
  const classId = cleanText(payload?.classId, 80);
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(payload?.email);
  if (!teacherId || !classId || !seatNo || !nickname || !isValidEmail(email)) return jsonError("請輸入座號、暱稱與正確的 Google Email。");

  const db = await ensureDb();
  if (!(await ownedActiveClass(db, teacherId, classId))) return jsonError("班級尚未啟用，或你沒有這個班級的管理權。", 403);
  const duplicate = await db
    .prepare("SELECT id FROM students WHERE email = ? OR (class_id = ? AND seat_no = ?)")
    .bind(email, classId, seatNo)
    .first();
  if (duplicate) return jsonError("這個座號或 Email 已經存在。");
  try {
    await db
      .prepare("INSERT INTO students (id, class_id, seat_no, nickname, email, pin_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(createId("stu"), classId, seatNo, nickname, email, await hashPin(`${classId}:${seatNo}`, `google:${email}`))
      .run();
  } catch {
    return jsonError("這個座號或 Email 已經存在。");
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    action?: string; teacherId?: string; classId?: string; studentId?: string; seatNo?: string; nickname?: string; email?: string;
  } | null;
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
  const classId = cleanText(payload?.classId, 80);
  const studentId = cleanText(payload?.studentId, 80);
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(payload?.email);
  if (!teacherId || !classId || !studentId) return jsonError("缺少學生資料。");

  const db = await ensureDb();
  if (!(await ownedActiveClass(db, teacherId, classId))) return jsonError("無這個班級的管理權。", 403);
  const current = await db
    .prepare("SELECT email FROM students WHERE id = ? AND class_id = ?")
    .bind(studentId, classId)
    .first<{ email: string }>();
  if (!current) return jsonError("找不到學生。", 404);

  if (!seatNo || !nickname || !isValidEmail(email)) return jsonError("請輸入座號、暱稱與正確的 Email。");
  if (email !== current.email) return jsonError("Firebase 登入 Email 不能由老師變更，請讓學生重新建立帳號。");
  try {
    const result = await db
      .prepare("UPDATE students SET seat_no = ?, nickname = ? WHERE id = ? AND class_id = ?")
      .bind(seatNo, nickname, studentId, classId)
      .run();
    if (!result.meta.changes) return jsonError("找不到學生。", 404);
  } catch {
    return jsonError("這個座號或 Email 已經存在。");
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const payload = (await request.json().catch(() => null)) as { teacherId?: string; classId?: string; studentId?: string } | null;
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
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
