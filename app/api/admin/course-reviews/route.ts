import { ensureDb } from "../../../../db";
import { requireSuperadmin } from "../../auth";
import { cleanText, createId, jsonError } from "../../_lib";
import { loadCourse } from "../../courses/_shared";
import { referenceStorageStatus } from "../../reference-storage";

export async function GET(request: Request) {
  const actor = await requireSuperadmin(request);
  if (actor instanceof Response) return actor;
  if (!referenceStorageStatus().configured) return jsonError("Cloudflare 檔案儲存尚未啟用。", 503);
  const versionId = cleanText(new URL(request.url).searchParams.get("versionId"), 100);
  const db = await ensureDb();
  if (versionId) {
    const row = await db.prepare("SELECT course_id FROM course_versions WHERE id = ?").bind(versionId).first<{ course_id: string }>();
    if (!row) return jsonError("找不到課程版本。", 404);
    return Response.json({ course: await loadCourse(row.course_id) });
  }
  const rows = await db.prepare(
    `SELECT cv.id AS version_id, cv.version_no, cv.created_at, c.id AS course_id, c.title, c.summary,
      t.name AS owner_name, t.email AS owner_email,
      (SELECT COUNT(*) FROM lessons WHERE course_version_id = cv.id) AS lesson_count,
      (SELECT COUNT(*) FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE l.course_version_id = cv.id) AS question_count
     FROM course_versions cv JOIN courses c ON c.id = cv.course_id JOIN teachers t ON t.id = c.owner_teacher_id
     WHERE cv.status = 'submitted' ORDER BY cv.created_at`
  ).all();
  return Response.json({ reviews: rows.results ?? [] });
}

export async function PATCH(request: Request) {
  const actor = await requireSuperadmin(request);
  if (actor instanceof Response) return actor;
  if (!referenceStorageStatus().configured) return jsonError("Cloudflare 檔案儲存尚未啟用。", 503);
  const payload = await request.json().catch(() => null) as { action?: string; versionId?: string; comment?: string } | null;
  const action = cleanText(payload?.action, 30);
  const versionId = cleanText(payload?.versionId, 100);
  const comment = cleanText(payload?.comment, 1000);
  const db = await ensureDb();
  const version = await db.prepare("SELECT id, course_id, status FROM course_versions WHERE id = ?").bind(versionId)
    .first<{ id: string; course_id: string; status: string }>();
  if (!version || version.status !== "submitted") return jsonError("找不到待審課程。", 404);

  if (action === "approve") {
    await db.batch([
      db.prepare("UPDATE course_versions SET status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?").bind(versionId),
      db.prepare("UPDATE courses SET status = 'published', current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(versionId, version.course_id),
      db.prepare("INSERT INTO course_reviews (id, course_version_id, reviewer_id, status, comment) VALUES (?, ?, ?, 'approved', ?)")
        .bind(createId("review"), versionId, actor.teacher.id, comment),
    ]);
    return Response.json({ ok: true });
  }
  if (action === "reject") {
    if (!comment) return jsonError("退回時請填寫修改原因。");
    await db.batch([
      db.prepare("UPDATE course_versions SET status = 'changes_requested' WHERE id = ?").bind(versionId),
      db.prepare("UPDATE courses SET status = 'changes_requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(version.course_id),
      db.prepare("INSERT INTO course_reviews (id, course_version_id, reviewer_id, status, comment) VALUES (?, ?, ?, 'changes_requested', ?)")
        .bind(createId("review"), versionId, actor.teacher.id, comment),
    ]);
    return Response.json({ ok: true });
  }
  return jsonError("不支援的審核操作。");
}
