import { chapters } from "../../../course-data";
import { cleanText, jsonError } from "../../_lib";
import { ensureDb } from "../../../../db";
import { requireTeacher } from "../../auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const teacherId = actor.teacher.id;
  const classId = cleanText(searchParams.get("classId"), 80);

  if (!classId) {
    return jsonError("缺少老師或班級資料。");
  }

  const db = await ensureDb();
  const classRow = await db
    .prepare(
      `SELECT c.*, school.name AS school_name FROM classes c
       JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN schools school ON school.id = c.school_id
       WHERE c.id = ? AND c.teacher_id = ? AND t.status = 'active'`
    )
    .bind(classId, teacherId)
    .first();

  if (!classRow) {
    return jsonError("找不到班級，或這不是你的班級。", 404);
  }

  const students = await db
    .prepare(
      `SELECT id, class_id, seat_no, nickname, email, status, created_at
       FROM students
       WHERE class_id = ?
       ORDER BY CAST(seat_no AS INTEGER), seat_no`
    )
    .bind(classId)
    .all();
  const submissions = await db
    .prepare(
      `SELECT s.id, s.student_id, s.chapter_no, s.file_name, s.file_size,
        s.auto_score, s.status, s.external_status, s.project_url, s.feedback, s.updated_at
       FROM submissions s
       JOIN students st ON st.id = s.student_id
       WHERE st.class_id = ?
       ORDER BY s.chapter_no ASC`
    )
    .bind(classId)
    .all();
  const badges = await db
    .prepare(
      `SELECT b.id, b.student_id, b.chapter_no, b.badge_name, b.earned_at
       FROM badges b
       JOIN students st ON st.id = b.student_id
       WHERE st.class_id = ?
       ORDER BY b.chapter_no ASC`
    )
    .bind(classId)
    .all();
  const courses = await db.prepare(
    `SELECT cc.id, cc.course_version_id, cc.status, cc.assignment_enabled, c.title
     FROM class_courses cc
     JOIN course_versions cv ON cv.id = cc.course_version_id
     JOIN courses c ON c.id = cv.course_id
     WHERE cc.class_id = ?
     ORDER BY cc.sort_order, cc.created_at`
  ).bind(classId).all();
  const activeCourse = (courses.results ?? []).find((course) => course.status === "active");
  const questionProgress = activeCourse ? await db.prepare(
    `SELECT 'questions:' || st.id || ':' || l.id AS id,
      st.id AS student_id, l.id AS lesson_id, l.sort_order + 1 AS chapter_no,
      l.badge_name, COALESCE(MAX(qr.file_name), '') AS file_name,
      COALESCE(MAX(qr.file_size), 0) AS file_size,
      COUNT(q.id) AS question_count,
      SUM(CASE WHEN qr.id IS NOT NULL THEN 1 ELSE 0 END) AS attempted_count,
      SUM(CASE WHEN qr.status = 'passed' THEN 1 ELSE 0 END) AS passed_count,
      SUM(CASE WHEN qr.status = 'needs_fix' THEN 1 ELSE 0 END) AS needs_fix_count,
      CAST(ROUND(100.0 * SUM(CASE WHEN qr.status = 'passed' THEN 1 ELSE 0 END) / COUNT(q.id)) AS INTEGER) AS auto_score,
      CASE
        WHEN SUM(CASE WHEN qr.status = 'passed' THEN 1 ELSE 0 END) = COUNT(q.id) THEN 'passed'
        WHEN SUM(CASE WHEN qr.status = 'needs_fix' THEN 1 ELSE 0 END) > 0 THEN 'needs_fix'
        ELSE 'in_progress'
      END AS status,
      COALESCE(MAX(qr.updated_at), CURRENT_TIMESTAMP) AS updated_at
     FROM students st
     JOIN lessons l ON l.course_version_id = ?
     JOIN questions q ON q.lesson_id = l.id
     LEFT JOIN question_results qr ON qr.student_id = st.id AND qr.question_id = q.id
     WHERE st.class_id = ?
     GROUP BY st.id, l.id, l.sort_order, l.badge_name
     HAVING SUM(CASE WHEN qr.id IS NOT NULL THEN 1 ELSE 0 END) > 0
     ORDER BY l.sort_order ASC`
  ).bind(activeCourse.course_version_id, classId).all<Record<string, unknown>>() : null;
  const courseProjects = await db.prepare(
    `SELECT cps.id, cps.class_course_id, cps.student_id, cps.project_url, cps.updated_at, c.title AS course_title
     FROM course_project_submissions cps
     JOIN class_courses cc ON cc.id = cps.class_course_id
     JOIN course_versions cv ON cv.id = cc.course_version_id
     JOIN courses c ON c.id = cv.course_id
     WHERE cc.class_id = ?
     ORDER BY c.title, cps.updated_at DESC`
  ).bind(classId).all();

  const mergedSubmissions = new Map<string, Record<string, unknown>>();
  for (const submission of submissions.results ?? []) {
    mergedSubmissions.set(`${submission.student_id}:${submission.chapter_no}`, submission);
  }
  const mergedBadges = new Map<string, Record<string, unknown>>();
  for (const badge of badges.results ?? []) {
    mergedBadges.set(`${badge.student_id}:${badge.chapter_no}`, badge);
  }
  for (const progress of questionProgress?.results ?? []) {
    const key = `${progress.student_id}:${progress.chapter_no}`;
    mergedSubmissions.set(key, {
      ...progress,
      external_status: "not_required",
      project_url: "",
      feedback: "",
    });
    if (progress.status === "passed") {
      mergedBadges.set(key, {
        id: `question-badge:${progress.student_id}:${progress.lesson_id}`,
        student_id: progress.student_id,
        chapter_no: progress.chapter_no,
        badge_name: progress.badge_name,
        earned_at: progress.updated_at,
      });
    } else {
      mergedBadges.delete(key);
    }
  }

  return Response.json({
    class: classRow,
    chapters,
    students: students.results ?? [],
    submissions: [...mergedSubmissions.values()],
    badges: [...mergedBadges.values()],
    courses: courses.results ?? [],
    courseProjects: courseProjects.results ?? [],
  });
}
