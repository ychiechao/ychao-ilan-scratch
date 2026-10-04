import { ensureDb } from "../../../db";
import { requireStudent } from "../auth";
import { cleanText, createId, jsonError } from "../_lib";

function normalizeProjectUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const actor = await requireStudent(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as {
    membershipId?: string;
    adoptionId?: string;
    projectUrl?: string;
  } | null;
  const membershipId = cleanText(payload?.membershipId, 80) || actor.student.id;
  const adoptionId = cleanText(payload?.adoptionId, 100);
  const projectUrl = normalizeProjectUrl(cleanText(payload?.projectUrl, 600));
  if (!adoptionId || !projectUrl) return jsonError("請輸入完整的作品網址。");

  const db = await ensureDb();
  const assignment = await db.prepare(
    `SELECT cc.id, c.title FROM class_courses cc
     JOIN classes cl ON cl.id = cc.class_id
     JOIN teachers t ON t.id = cl.teacher_id
     JOIN students s ON s.class_id = cl.id
     JOIN course_versions cv ON cv.id = cc.course_version_id
     JOIN courses c ON c.id = cv.course_id
     WHERE cc.id = ? AND s.id = ? AND (s.firebase_uid = ? OR s.email = ?)
       AND cc.status = 'active' AND cc.assignment_enabled = 1
       AND s.status = 'active' AND cl.status = 'active' AND t.status = 'active'`
  ).bind(adoptionId, membershipId, actor.firebase.localId, actor.firebase.email.toLowerCase())
    .first<{ id: string; title: string }>();
  if (!assignment) return jsonError("這門課目前沒有開放作業繳交。", 403);

  await db.prepare(
    `INSERT INTO course_project_submissions (id, class_course_id, student_id, project_url)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(class_course_id, student_id) DO UPDATE SET
       project_url = excluded.project_url, updated_at = CURRENT_TIMESTAMP`
  ).bind(createId("project"), adoptionId, membershipId, projectUrl).run();
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action, detail_json) VALUES (?, 'student', ?, 'course_project_submitted', ?)")
    .bind(createId("activity"), membershipId, JSON.stringify({ adoptionId, courseTitle: assignment.title })).run();

  return Response.json({ projectUrl });
}
