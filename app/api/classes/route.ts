import { cleanText, createId, generateClassCode, jsonError, publicClass } from "../_lib";
import { ensureDb } from "../../../db";
import { requireTeacher } from "../auth";
import { ILC_SCRATCH_HOME, ILC_SCRATCH_LABEL, isIlcScratchPlatform } from "../../submission-links";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    teacherId?: string;
    name?: string;
    courseVersionId?: string;
  } | null;

  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
  const name = cleanText(payload?.name) || "Scratch 基礎班";
  const courseVersionId = cleanText(payload?.courseVersionId, 100);

  const db = await ensureDb();
  const teacher = await db
    .prepare("SELECT id, status FROM teachers WHERE id = ?")
    .bind(teacherId)
    .first<{ id: string; status: string }>();

  if (!teacher) {
    return jsonError("找不到老師帳號。", 404);
  }
  if (teacher.status !== "active") {
    return jsonError("老師帳號尚未啟用，請等待超級管理者審核。", 403);
  }

  if (courseVersionId) {
    const allowedCourse = await db.prepare(
      `SELECT cv.id FROM course_versions cv JOIN courses c ON c.id = cv.course_id
       WHERE cv.id = ? AND cv.status = 'published' AND c.current_version_id = cv.id
         AND NOT EXISTS (SELECT 1 FROM teacher_course_permissions tcp
           WHERE tcp.teacher_id = ? AND tcp.course_id = c.id AND tcp.allowed = 0)`
    ).bind(courseVersionId, teacherId).first();
    if (!allowedCourse) return jsonError("選擇的課程目前無法使用。", 403);
  }

  const classId = createId("cls");
  const code = await generateClassCode();
  await db
    .prepare(
      `INSERT INTO classes (
        id, teacher_id, name, code, submission_url, submission_label, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    )
    .bind(classId, teacherId, name, code, "", ILC_SCRATCH_LABEL)
    .run();

  if (courseVersionId) {
    await db.prepare("INSERT INTO class_courses (id, class_id, course_version_id, sort_order, status) VALUES (?, ?, ?, 0, 'active')")
      .bind(createId("adoption"), classId, courseVersionId).run();
  }

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(classId)
    .first();

  return Response.json({ class: publicClass(classRow as never) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    teacherId?: string;
    classId?: string;
    submissionUrl?: string;
    submissionLabel?: string;
  } | null;

  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
  const classId = cleanText(payload?.classId, 80);
  let submissionUrl = cleanText(payload?.submissionUrl, 500);
  let submissionLabel = cleanText(payload?.submissionLabel, 40) || ILC_SCRATCH_LABEL;

  if (!classId) {
    return jsonError("缺少老師或班級資料。");
  }

  const db = await ensureDb();
  if (payload?.action === "toggle_enrollment") {
    const result = await db
      .prepare(
        `UPDATE classes
         SET enrollment_enabled = CASE enrollment_enabled WHEN 1 THEN 0 ELSE 1 END
         WHERE id = ? AND teacher_id = ? AND status = 'active'
           AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND status = 'active')`
      )
      .bind(classId, teacherId, teacherId)
      .run();
    if (!result.meta.changes) {
      return jsonError("班級尚未通過審核，或這不是你的班級。", 403);
    }
    const classRow = await db.prepare("SELECT * FROM classes WHERE id = ?").bind(classId).first();
    return Response.json({ class: publicClass(classRow as never) });
  }

  if (submissionUrl) {
    try {
      const parsed = new URL(submissionUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return jsonError("請輸入完整的雲端繳交網址。");
    }
  }
  if (isIlcScratchPlatform(submissionUrl)) {
    submissionUrl = ILC_SCRATCH_HOME;
    submissionLabel = submissionLabel || ILC_SCRATCH_LABEL;
  }

  const result = await db
    .prepare(
      `UPDATE classes
       SET submission_url = ?, submission_label = ?
       WHERE id = ? AND teacher_id = ? AND status = 'active'
         AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND status = 'active')`
    )
    .bind(submissionUrl, submissionLabel, classId, teacherId, teacherId)
    .run();

  if (!result.meta.changes) {
    return jsonError("找不到班級，或這不是你的班級。", 404);
  }

  const classRow = await db.prepare("SELECT * FROM classes WHERE id = ?").bind(classId).first();
  return Response.json({ class: publicClass(classRow as never) });
}
