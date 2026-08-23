import { ensureDb } from "../../../../db";
import { cleanText, hashPin, jsonError } from "../../_lib";
import { adminError, requireAdmin } from "../_auth";

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    teacherId?: string;
    classId?: string;
    status?: string;
    newPin?: string;
  } | null;
  const action = cleanText(payload?.action, 40);
  const admin = await requireAdmin(request);
  if (!admin) return adminError();
  const db = await ensureDb();

  if (action === "teacher_status") {
    const teacherId = cleanText(payload?.teacherId, 80);
    const status = payload?.status === "active" ? "active" : "disabled";
    const result = await db
      .prepare("UPDATE teachers SET status = ? WHERE id = ? AND role = 'teacher'")
      .bind(status, teacherId)
      .run();
    if (!result.meta.changes) return jsonError("找不到可管理的教師。", 404);
    return Response.json({ ok: true });
  }

  if (action === "class_status") {
    const classId = cleanText(payload?.classId, 80);
    const status = payload?.status === "active" ? "active" : "disabled";
    const result = await db
      .prepare("UPDATE classes SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(status, classId)
      .run();
    if (!result.meta.changes) return jsonError("找不到班級。", 404);
    return Response.json({ ok: true });
  }

  if (action === "reset_teacher_pin") {
    const teacherId = cleanText(payload?.teacherId, 80);
    const newPin = cleanText(payload?.newPin, 12);
    if (newPin.length < 4) return jsonError("臨時 PIN 至少需要 4 碼。");
    const teacher = await db
      .prepare("SELECT email FROM teachers WHERE id = ? AND role = 'teacher'")
      .bind(teacherId)
      .first<{ email: string }>();
    if (!teacher) return jsonError("找不到教師。", 404);
    await db
      .prepare("UPDATE teachers SET pin_hash = ?, must_change_pin = 1 WHERE id = ?")
      .bind(await hashPin(teacher.email, newPin), teacherId)
      .run();
    return Response.json({ ok: true });
  }

  return jsonError("不支援的管理操作。");
}
