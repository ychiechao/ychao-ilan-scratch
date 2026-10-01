import { ensureDb } from "../../../../db";
import { cleanText, jsonError } from "../../_lib";
import { requireSuperadmin } from "../../auth";

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    teacherId?: string;
    classId?: string;
    status?: string;
  } | null;
  const action = cleanText(payload?.action, 40);
  const admin = await requireSuperadmin(request);
  if (admin instanceof Response) return admin;
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

  return jsonError("不支援的管理操作。");
}
