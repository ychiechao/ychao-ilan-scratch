import { ensureDb } from "../../../db";
import { requireActor, requireTeacher } from "../auth";
import { cleanText, createId, jsonError } from "../_lib";
import { ensureOfficialSeedCourse, loadCourse } from "../courses/_shared";

export async function GET(request: Request) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  await ensureOfficialSeedCourse();
  const url = new URL(request.url);
  const courseId = cleanText(url.searchParams.get("id"), 100);
  if (courseId) {
    const course = await loadCourse(courseId, true);
    if (!course) return jsonError("找不到已發布課程。", 404);
    const db = await ensureDb();
    const adoption = actor.teacher ? await db.prepare(
      `SELECT cc.id FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id
       WHERE cc.course_version_id = ? AND cl.teacher_id = ? AND cc.status = 'active' LIMIT 1`
    ).bind(course.version.id, actor.teacher.id).first() : null;
    const canSeeReference = actor.teacher?.role === "superadmin" || course.ownerTeacherId === actor.teacher?.id || Boolean(adoption);
    return Response.json({ course: hideReferenceFiles(course, canSeeReference) });
  }
  const search = cleanText(url.searchParams.get("q"), 80);
  const db = await ensureDb();
  const rows = await db.prepare(
    `SELECT c.id, c.title, c.summary, c.school_year, c.region, c.education_stage, c.tags_json,
      c.current_version_id, t.name AS owner_name, cv.version_no, cv.published_at,
      (SELECT COUNT(*) FROM lessons WHERE course_version_id = c.current_version_id) AS lesson_count,
      (SELECT COUNT(*) FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE l.course_version_id = c.current_version_id) AS question_count
     FROM courses c JOIN teachers t ON t.id = c.owner_teacher_id
     JOIN course_versions cv ON cv.id = c.current_version_id
     WHERE c.status = 'published'
       AND (? = 1 OR NOT EXISTS (
         SELECT 1 FROM teacher_course_permissions tcp
         WHERE tcp.teacher_id = ? AND tcp.course_id = c.id AND tcp.allowed = 0
       ))
       AND (? = '' OR c.title LIKE ? OR c.summary LIKE ? OR c.tags_json LIKE ?)
     ORDER BY cv.published_at DESC, c.title`
  ).bind(actor.teacher?.role === "superadmin" ? 1 : 0, actor.teacher?.id ?? "", search, `%${search}%`, `%${search}%`, `%${search}%`).all();
  let classes: unknown[] = [];
  let adoptions: unknown[] = [];
  if (actor.teacher?.status === "active") {
    classes = (await db.prepare("SELECT id, name, code, status FROM classes WHERE teacher_id = ? AND status = 'active' ORDER BY created_at DESC").bind(actor.teacher.id).all()).results ?? [];
    adoptions = (await db.prepare(
      `SELECT cc.id, cc.class_id, cl.name AS class_name, cc.course_version_id, cc.status, cc.sort_order,
        c.id AS course_id, c.current_version_id, cv.version_no AS adopted_version_no, latest.version_no AS latest_version_no
       FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id
       JOIN course_versions cv ON cv.id = cc.course_version_id JOIN courses c ON c.id = cv.course_id
       JOIN course_versions latest ON latest.id = c.current_version_id WHERE cl.teacher_id = ?`
    ).bind(actor.teacher.id).all()).results ?? [];
  }
  return Response.json({ courses: rows.results ?? [], classes, adoptions, canAdopt: actor.teacher?.status === "active" });
}

export async function POST(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as { classId?: string; courseVersionId?: string } | null;
  const classId = cleanText(payload?.classId, 100);
  const versionId = cleanText(payload?.courseVersionId, 100);
  const db = await ensureDb();
  const allowed = await db.prepare(
    `SELECT cv.id FROM course_versions cv JOIN courses c ON c.id = cv.course_id
     JOIN classes cl ON cl.id = ? WHERE cv.id = ? AND cv.status = 'published'
       AND c.current_version_id = cv.id AND cl.teacher_id = ? AND cl.status = 'active'
       AND (? = 'superadmin' OR NOT EXISTS (
         SELECT 1 FROM teacher_course_permissions tcp
         WHERE tcp.teacher_id = ? AND tcp.course_id = c.id AND tcp.allowed = 0
       ))`
  ).bind(classId, versionId, actor.teacher.id, actor.teacher.role, actor.teacher.id).first();
  if (!allowed) return jsonError("找不到可採用的課程或班級。", 404);
  const existing = await db.prepare(
    `SELECT cc.id, cc.course_version_id FROM class_courses cc
     JOIN course_versions old ON old.id = cc.course_version_id
     JOIN course_versions requested ON requested.id = ?
     WHERE cc.class_id = ? AND old.course_id = requested.course_id LIMIT 1`,
  ).bind(versionId, classId).first<{ id: string; course_version_id: string }>();
  if (existing) {
    if (existing.course_version_id !== versionId) return jsonError("這個班級已採用此課程的舊版本，請使用版本更新功能。", 409);
    await db.prepare("UPDATE class_courses SET status = 'active' WHERE id = ?").bind(existing.id).run();
    return Response.json({ ok: true });
  }
  const sort = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM class_courses WHERE class_id = ?").bind(classId).first<{ next_order: number }>();
  await db.prepare(`INSERT INTO class_courses (id, class_id, course_version_id, sort_order, status)
    VALUES (?, ?, ?, ?, 'active') ON CONFLICT(class_id, course_version_id) DO UPDATE SET status = 'active'`)
    .bind(createId("adoption"), classId, versionId, Number(sort?.next_order ?? 0)).run();
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as { action?: string; adoptionId?: string; direction?: string } | null;
  const action = cleanText(payload?.action, 30);
  const adoptionId = cleanText(payload?.adoptionId, 100);
  const db = await ensureDb();
  if (action === "toggle") {
    const result = await db.prepare(`UPDATE class_courses SET status = CASE status WHEN 'active' THEN 'disabled' ELSE 'active' END
      WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)`).bind(adoptionId, actor.teacher.id).run();
    if (!result.meta.changes) return jsonError("找不到班級課程。", 404);
    return Response.json({ ok: true });
  }
  if (action === "upgrade") {
    const result = await db.prepare(`UPDATE class_courses SET course_version_id = (
        SELECT c.current_version_id FROM course_versions old JOIN courses c ON c.id = old.course_id WHERE old.id = class_courses.course_version_id
      ) WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)`)
      .bind(adoptionId, actor.teacher.id).run();
    if (!result.meta.changes) return jsonError("找不到可升級的班級課程。", 404);
    return Response.json({ ok: true });
  }
  if (action === "move") {
    const direction = payload?.direction === "up" ? "up" : payload?.direction === "down" ? "down" : "";
    if (!direction) return jsonError("排序方向不正確。");
    const current = await db.prepare(
      `SELECT cc.id, cc.class_id, cc.sort_order FROM class_courses cc
       JOIN classes cl ON cl.id = cc.class_id WHERE cc.id = ? AND cl.teacher_id = ?`,
    ).bind(adoptionId, actor.teacher.id).first<{ id: string; class_id: string; sort_order: number }>();
    if (!current) return jsonError("找不到班級課程。", 404);
    const operator = direction === "up" ? "<" : ">";
    const order = direction === "up" ? "DESC" : "ASC";
    const adjacent = await db.prepare(
      `SELECT id, sort_order FROM class_courses WHERE class_id = ? AND sort_order ${operator} ? ORDER BY sort_order ${order} LIMIT 1`,
    ).bind(current.class_id, current.sort_order).first<{ id: string; sort_order: number }>();
    if (!adjacent) return Response.json({ ok: true });
    await db.batch([
      db.prepare("UPDATE class_courses SET sort_order = ? WHERE id = ?").bind(adjacent.sort_order, current.id),
      db.prepare("UPDATE class_courses SET sort_order = ? WHERE id = ?").bind(current.sort_order, adjacent.id),
    ]);
    return Response.json({ ok: true });
  }
  return jsonError("不支援的採用操作。");
}

function hideReferenceFiles(course: Awaited<ReturnType<typeof loadCourse>>, isAdmin: boolean) {
  if (!course || isAdmin) return course;
  return {
    ...course,
    lessons: course.lessons.map((lesson) => ({
      ...lesson,
      questions: lesson.questions.map((question) => ({ ...question, referenceAssetId: null, referenceFileName: null, referenceFileSize: null })),
    })),
  };
}
