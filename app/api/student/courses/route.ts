import { ensureDb } from "../../../../db";
import { requireStudent } from "../../auth";
import { cleanText, jsonError } from "../../_lib";
import { loadCourse } from "../../courses/_shared";

export async function GET(request: Request) {
  const actor = await requireStudent(request);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const courseId = cleanText(url.searchParams.get("id"), 100);
  const adoptionId = cleanText(url.searchParams.get("adoptionId"), 100);
  const db = await ensureDb();
  const memberships = await db.prepare(
    `SELECT s.id AS membership_id, s.class_id, s.seat_no, s.nickname, s.status,
      cl.name AS class_name, cl.code AS class_code, school.name AS school_name,
      (SELECT COUNT(*) FROM class_courses cc WHERE cc.class_id = cl.id AND cc.status = 'active') AS course_count,
      (SELECT COUNT(*) FROM question_results qr WHERE qr.student_id = s.id AND qr.status = 'passed') AS passed_count
     FROM students s
     JOIN classes cl ON cl.id = s.class_id
     JOIN teachers class_teacher ON class_teacher.id = cl.teacher_id
     LEFT JOIN schools school ON school.id = cl.school_id
     WHERE (s.firebase_uid = ? OR s.email = ?)
       AND cl.archived = 0 AND class_teacher.status = 'active'
     ORDER BY cl.name, CAST(s.seat_no AS INTEGER), s.seat_no`
  ).bind(actor.firebase.localId, actor.firebase.email.toLowerCase()).all<Record<string, unknown>>();
  const adoptions = await db.prepare(
    `SELECT cc.id AS adoption_id, s.id AS membership_id, s.class_id, cl.name AS class_name,
      cc.assignment_enabled,
      cc.course_version_id, cc.sort_order, c.id AS course_id, c.title, c.summary,
      cv.version_no, owner.name AS owner_name,
      (SELECT COUNT(*) FROM lessons WHERE course_version_id = cv.id) AS lesson_count,
      (SELECT COUNT(*) FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE l.course_version_id = cv.id) AS question_count,
      (SELECT COUNT(*) FROM question_results qr JOIN questions q ON q.id = qr.question_id JOIN lessons l ON l.id = q.lesson_id
        WHERE qr.student_id = s.id AND l.course_version_id = cv.id AND qr.status = 'passed') AS passed_count,
      (SELECT cps.project_url FROM course_project_submissions cps
        WHERE cps.class_course_id = cc.id AND cps.student_id = s.id) AS project_url
     FROM students s
     JOIN classes cl ON cl.id = s.class_id
     JOIN teachers class_teacher ON class_teacher.id = cl.teacher_id
     JOIN class_courses cc ON cc.class_id = cl.id
     JOIN course_versions cv ON cv.id = cc.course_version_id
     JOIN courses c ON c.id = cv.course_id
     JOIN teachers owner ON owner.id = c.owner_teacher_id
     WHERE (s.firebase_uid = ? OR s.email = ?) AND s.status = 'active'
       AND cl.status = 'active' AND cl.archived = 0 AND class_teacher.status = 'active' AND cc.status = 'active'
     ORDER BY cl.name, cc.sort_order, cc.created_at`
  ).bind(actor.firebase.localId, actor.firebase.email.toLowerCase()).all<Record<string, unknown>>();
  if (!courseId) return Response.json({
    courses: adoptions.results ?? [],
    classes: memberships.results ?? [],
  });
  const adoption = (adoptions.results ?? []).find((item) => (
    item.course_id === courseId && (!adoptionId || item.adoption_id === adoptionId)
  ));
  if (!adoption) return jsonError("這門課尚未指派給你的班級。", 403);
  const course = await loadCourse(courseId, false, String(adoption.course_version_id));
  if (!course) return jsonError("找不到課程。", 404);
  const progressRows = await db.prepare("SELECT question_id, score, status, results_json, updated_at FROM question_results WHERE student_id = ?")
    .bind(String(adoption.membership_id)).all();
  return Response.json({
    course: hideReferences(course),
    progress: progressRows.results ?? [],
    membershipId: adoption.membership_id,
    class: { id: adoption.class_id, name: adoption.class_name },
    assignment: {
      enabled: Boolean(adoption.assignment_enabled),
      projectUrl: String(adoption.project_url ?? ""),
    },
  });
}

function hideReferences(course: NonNullable<Awaited<ReturnType<typeof loadCourse>>>) {
  return { ...course, lessons: course.lessons.map((lesson) => ({ ...lesson, questions: lesson.questions.map((question) => ({ ...question, referenceAssetId: null, referenceFileName: null, referenceFileSize: null, analysis: null })) })) };
}
