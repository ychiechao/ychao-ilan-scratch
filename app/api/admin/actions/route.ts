import { ensureDb } from "../../../../db";
import { cleanText, createId, jsonError } from "../../_lib";
import { requireSuperadmin } from "../../auth";

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = cleanText(payload?.action, 40);
  const admin = await requireSuperadmin(request);
  if (admin instanceof Response) return admin;
  const db = await ensureDb();

  if (action === "school_upsert") {
    const schoolId = cleanText(payload?.schoolId, 100);
    const name = cleanText(payload?.name, 100);
    const division = ["E", "J", "unclassified"].includes(String(payload?.division)) ? String(payload?.division) : "unclassified";
    const domains = normalizeDomains(payload?.domains);
    const enabled = payload?.enabled === false ? 0 : 1;
    if (!name) return jsonError("請輸入學校名稱。");
    try {
      if (schoolId) {
        const result = await db.prepare(
          "UPDATE schools SET name = ?, domains_json = ?, division = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(name, JSON.stringify(domains), division, enabled, schoolId).run();
        if (!result.meta.changes) return jsonError("找不到學校。", 404);
      } else {
        await db.prepare(
          "INSERT INTO schools (id, name, domains_json, division, enabled) VALUES (?, ?, ?, ?, ?)"
        ).bind(createId("school"), name, JSON.stringify(domains), division, enabled).run();
      }
    } catch {
      return jsonError("學校名稱已存在，請使用不同名稱。");
    }
    await logAdminAction(db, admin.teacher.id, "school_upsert", { schoolId, name, division, domains, enabled: Boolean(enabled) });
    return Response.json({ ok: true });
  }
  if (action === "school_status") {
    const schoolId = cleanText(payload?.schoolId, 100);
    const enabled = payload?.enabled === true ? 1 : 0;
    const result = await db.prepare("UPDATE schools SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(enabled, schoolId).run();
    if (!result.meta.changes) return jsonError("找不到學校。", 404);
    await logAdminAction(db, admin.teacher.id, "school_status", { schoolId, enabled: Boolean(enabled) });
    return Response.json({ ok: true });
  }

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
  if (action === "class_profile") {
    const classId = cleanText(payload?.classId, 100);
    const schoolId = cleanText(payload?.schoolId, 100);
    const status = ["pending", "active", "disabled"].includes(String(payload?.status)) ? String(payload?.status) : "pending";
    const archived = payload?.archived === true ? 1 : 0;
    const enrollmentEnabled = archived || payload?.enrollmentEnabled === false ? 0 : 1;
    if (schoolId) {
      const currentClass = await db.prepare("SELECT school_id FROM classes WHERE id = ?").bind(classId).first<{ school_id: string | null }>();
      if (!currentClass) return jsonError("找不到班級。", 404);
      const school = await db.prepare("SELECT id, enabled FROM schools WHERE id = ?").bind(schoolId).first<{ id: string; enabled: number }>();
      if (!school) return jsonError("找不到指定的學校。", 404);
      if (!school.enabled && currentClass.school_id !== schoolId) return jsonError("已停用的學校不能再指派給班級。");
    }
    const result = await db.prepare(
      `UPDATE classes SET school_id = ?, status = ?, archived = ?, enrollment_enabled = ?,
        reviewed_at = CASE WHEN ? <> 'pending' THEN CURRENT_TIMESTAMP ELSE reviewed_at END
       WHERE id = ?`
    ).bind(schoolId || null, status, archived, enrollmentEnabled, status, classId).run();
    if (!result.meta.changes) return jsonError("找不到班級。", 404);
    await logAdminAction(db, admin.teacher.id, "class_profile", { classId, schoolId, status, archived: Boolean(archived), enrollmentEnabled: Boolean(enrollmentEnabled) });
    return Response.json({ ok: true });
  }
  if (action === "user_profile") {
    const userType = payload?.userType === "student" ? "student" : "teacher";
    const userId = cleanText(payload?.userId, 100);
    const requestedSchoolIds = Array.isArray(payload?.schoolIds)
      ? payload.schoolIds.map((item) => cleanText(item, 100)).filter(Boolean)
      : [];
    const schoolId = cleanText(payload?.schoolId, 100) || requestedSchoolIds[0] || "";
    const requestedStatus = String(payload?.status);
    const status = ["pending", "active", "disabled", "removed"].includes(requestedStatus) ? requestedStatus : "active";
    if (!userId) return jsonError("缺少使用者資料。");
    const schoolRows = (await db.prepare("SELECT id, name, enabled FROM schools").all<{ id: string; name: string; enabled: number }>()).results ?? [];
    const schoolMap = new Map(schoolRows.map((school) => [school.id, school]));
    const selectedSchool = schoolId ? schoolMap.get(schoolId) : undefined;
    if (schoolId && !selectedSchool) return jsonError("找不到指定的學校。", 404);
    if (userType === "student") {
      const studentStatus = ["active", "disabled", "removed"].includes(status) ? status : "active";
      const currentStudent = await db.prepare("SELECT school_id FROM students WHERE id = ?").bind(userId).first<{ school_id: string | null }>();
      if (!currentStudent) return jsonError("找不到學生。", 404);
      if (selectedSchool && !selectedSchool.enabled && currentStudent.school_id !== schoolId) return jsonError("已停用的學校不能再指派給學生。");
      const result = await db.prepare(
        "UPDATE students SET school_id = ?, school_name = ?, school_source = 'admin', school_verified = ?, status = ? WHERE id = ?"
      ).bind(schoolId || null, selectedSchool?.name ?? "", schoolId ? 1 : 0, studentStatus, userId).run();
      if (!result.meta.changes) return jsonError("找不到學生。", 404);
    } else {
      const role = payload?.role === "superadmin" ? "superadmin" : "teacher";
      const teacherStatus = ["pending", "active", "disabled"].includes(status) ? status : "disabled";
      if (userId === admin.teacher.id && (role !== "superadmin" || teacherStatus !== "active")) return jsonError("不能停用或降級目前登入的超管帳號。");
      const schoolIds = [...new Set((requestedSchoolIds.length ? requestedSchoolIds : schoolId ? [schoolId] : []).filter((id) => schoolMap.has(id)))];
      const currentAssignments = (await db.prepare(
        "SELECT school_id FROM teacher_school_assignments WHERE teacher_id = ?"
      ).bind(userId).all<{ school_id: string }>()).results ?? [];
      const currentSchoolIds = new Set(currentAssignments.map((item) => item.school_id));
      if (schoolIds.some((id) => !schoolMap.get(id)?.enabled && !currentSchoolIds.has(id))) return jsonError("已停用的學校不能再指派給教師。");
      if (role === "teacher" && teacherStatus === "active" && schoolIds.length === 0) return jsonError("啟用教師前，請至少指定一所任教學校。");
      const primarySchool = schoolMap.get(schoolIds[0] ?? "");
      const result = await db.prepare("UPDATE teachers SET school_id = ?, school_name = ?, role = ?, status = ? WHERE id = ?")
        .bind(primarySchool?.id ?? null, primarySchool?.name ?? "", role, teacherStatus, userId).run();
      if (!result.meta.changes) return jsonError("找不到教師。", 404);
      await db.prepare("DELETE FROM teacher_school_assignments WHERE teacher_id = ?").bind(userId).run();
      if (schoolIds.length > 0) {
        await db.batch(schoolIds.map((id) => db.prepare(
          "INSERT INTO teacher_school_assignments (id, teacher_id, school_id) VALUES (?, ?, ?)"
        ).bind(createId("tsa"), userId, id)));
      }
      if (primarySchool) {
        await db.prepare("UPDATE classes SET school_id = ? WHERE teacher_id = ? AND school_id IS NULL")
          .bind(primarySchool.id, userId).run();
      }
    }
    await logAdminAction(db, admin.teacher.id, "user_profile", { userType, userId, schoolId, schoolIds: requestedSchoolIds, role: payload?.role, status });
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

function normalizeDomains(value: unknown) {
  const source = Array.isArray(value) ? value.join(",") : cleanText(value, 500);
  return [...new Set(source.split(/[\s,;]+/).map((item) => item.trim().toLowerCase().replace(/^@/, "")).filter((item) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(item)))];
}
