import { ensureDb } from "../../../../db";
import { cleanText, createId, jsonError } from "../../_lib";
import { requireSuperadmin } from "../../auth";

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = cleanText(payload?.action, 40);
  const admin = await requireSuperadmin(request);
  if (admin instanceof Response) return admin;
  const db = await ensureDb();

  if (action === "teacher_status") {
    const teacherId = cleanText(payload?.teacherId, 80);
    const status = payload?.status === "active" ? "active" : "disabled";
    const result = await db.prepare("UPDATE teachers SET status = ? WHERE id = ? AND role = 'teacher'").bind(status, teacherId).run();
    if (!result.meta.changes) return jsonError("找不到可管理的教師。", 404);
    await logAdminAction(db, admin.teacher.id, "teacher_status", { teacherId, status });
    return Response.json({ ok: true });
  }
  if (action === "class_status") {
    const classId = cleanText(payload?.classId, 80);
    const status = payload?.status === "active" ? "active" : "disabled";
    const result = await db.prepare("UPDATE classes SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, classId).run();
    if (!result.meta.changes) return jsonError("找不到班級。", 404);
    await logAdminAction(db, admin.teacher.id, "class_status", { classId, status });
    return Response.json({ ok: true });
  }
  if (action === "user_profile") {
    const userType = payload?.userType === "student" ? "student" : "teacher";
    const userId = cleanText(payload?.userId, 100);
    const schoolName = cleanText(payload?.schoolName, 100);
    const status = ["pending", "active", "disabled"].includes(String(payload?.status)) ? String(payload?.status) : "active";
    if (!userId) return jsonError("缺少使用者資料。");
    if (userType === "student") {
      const result = await db.prepare("UPDATE students SET school_name = ?, status = ? WHERE id = ?").bind(schoolName, status === "disabled" ? "disabled" : "active", userId).run();
      if (!result.meta.changes) return jsonError("找不到學生。", 404);
    } else {
      const role = payload?.role === "superadmin" ? "superadmin" : "teacher";
      if (userId === admin.teacher.id && (role !== "superadmin" || status !== "active")) return jsonError("不能停用或降級目前登入的超管帳號。");
      const result = await db.prepare("UPDATE teachers SET school_name = ?, role = ?, status = ? WHERE id = ?").bind(schoolName, role, status, userId).run();
      if (!result.meta.changes) return jsonError("找不到教師。", 404);
    }
    await logAdminAction(db, admin.teacher.id, "user_profile", { userType, userId, schoolName, status });
    return Response.json({ ok: true });
  }
  if (action === "course_permission") {
    const teacherId = cleanText(payload?.teacherId, 100);
    const courseId = cleanText(payload?.courseId, 100);
    const allowed = payload?.allowed === false ? 0 : 1;
    const teacher = await db.prepare("SELECT id FROM teachers WHERE id = ? AND role = 'teacher'").bind(teacherId).first();
    const course = await db.prepare("SELECT id FROM courses WHERE id = ? AND status = 'published'").bind(courseId).first();
    if (!teacher || !course) return jsonError("找不到教師或已發布課程。", 404);
    await db.prepare(`INSERT INTO teacher_course_permissions (id, teacher_id, course_id, allowed, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(teacher_id, course_id) DO UPDATE SET allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
      .bind(createId("perm"), teacherId, courseId, allowed, admin.teacher.id).run();
    await logAdminAction(db, admin.teacher.id, "course_permission", { teacherId, courseId, allowed: Boolean(allowed) });
    return Response.json({ ok: true });
  }
  return jsonError("不支援的管理操作。");
}

async function logAdminAction(db: D1Database, adminId: string, action: string, detail: unknown) {
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action, detail_json) VALUES (?, 'teacher', ?, ?, ?)")
    .bind(createId("activity"), adminId, action, JSON.stringify(detail)).run();
}
