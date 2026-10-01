import { ensureDb } from "../../../../db";
import { requireStudent } from "../../auth";
import { cleanText, jsonError } from "../../_lib";
import { loadCourse } from "../../courses/_shared";

export async function GET(request: Request) {
  const actor = await requireStudent(request);
  if (actor instanceof Response) return actor;
  const courseId = cleanText(new URL(request.url).searchParams.get("id"), 100);
  const db = await ensureDb();
  const adoptions = await db.prepare(
    `SELECT cc.id, cc.course_version_id, cc.sort_order, c.id AS course_id, c.title, c.summary,
      cv.version_no, t.name AS owner_name,
      (SELECT COUNT(*) FROM lessons WHERE course_version_id = cv.id) AS lesson_count,
      (SELECT COUNT(*) FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE l.course_version_id = cv.id) AS question_count,
      (SELECT COUNT(*) FROM question_results qr JOIN questions q ON q.id = qr.question_id JOIN lessons l ON l.id = q.lesson_id
        WHERE qr.student_id = ? AND l.course_version_id = cv.id AND qr.status = 'passed') AS passed_count
     FROM class_courses cc JOIN course_versions cv ON cv.id = cc.course_version_id
     JOIN courses c ON c.id = cv.course_id JOIN teachers t ON t.id = c.owner_teacher_id
     WHERE cc.class_id = ? AND cc.status = 'active' ORDER BY cc.sort_order, cc.created_at`
  ).bind(actor.student.id, actor.student.classId).all<Record<string, unknown>>();
  if (!courseId) return Response.json({ courses: adoptions.results ?? [] });
  const adoption = (adoptions.results ?? []).find((item) => item.course_id === courseId);
  if (!adoption) return jsonError("這門課尚未指派給你的班級。", 403);
  const course = await loadCourse(courseId, false, String(adoption.course_version_id));
  if (!course) return jsonError("找不到課程。", 404);
  const progressRows = await db.prepare("SELECT question_id, score, status, results_json, updated_at FROM question_results WHERE student_id = ?")
    .bind(actor.student.id).all();
  return Response.json({ course: hideReferences(course), progress: progressRows.results ?? [] });
}

function hideReferences(course: NonNullable<Awaited<ReturnType<typeof loadCourse>>>) {
  return { ...course, lessons: course.lessons.map((lesson) => ({ ...lesson, questions: lesson.questions.map((question) => ({ ...question, referenceAssetId: null, referenceFileName: null, referenceFileSize: null, analysis: null })) })) };
}
