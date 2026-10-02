import { ensureDb } from "../../../../db";
import { requireSuperadmin } from "../../auth";
import { referenceStorageStatus } from "../../reference-storage";

export async function GET(request: Request) {
  const admin = await requireSuperadmin(request);
  if (admin instanceof Response) return admin;
  const db = await ensureDb();
  const teachers = await db.prepare(
    `SELECT id, name, email, role, status, must_change_pin, school_name,
      last_login_at, last_active_at, created_at,
      (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = teachers.id) AS class_count,
      (SELECT COUNT(*) FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = teachers.id) AS student_count
     FROM teachers ORDER BY CASE role WHEN 'superadmin' THEN 0 ELSE 1 END, created_at DESC`
  ).all();
  const students = await db.prepare(
    `SELECT s.id, s.nickname AS name, s.email, 'student' AS role, s.status, s.school_name,
      s.last_login_at, s.last_active_at, s.created_at, s.seat_no, c.name AS class_name,
      t.name AS teacher_name,
      (SELECT COUNT(*) FROM question_results qr WHERE qr.student_id = s.id) +
        (SELECT COUNT(*) FROM submissions su WHERE su.student_id = s.id) AS solved_count,
      (SELECT COUNT(*) FROM question_results qr WHERE qr.student_id = s.id AND qr.status = 'passed') +
        (SELECT COUNT(*) FROM submissions su WHERE su.student_id = s.id AND su.status = 'passed') AS passed_count,
      (SELECT COUNT(*) FROM badges b WHERE b.student_id = s.id) AS badge_count,
      COALESCE((SELECT MAX(qr.updated_at) FROM question_results qr WHERE qr.student_id = s.id),
        (SELECT MAX(su.updated_at) FROM submissions su WHERE su.student_id = s.id)) AS last_solved_at
     FROM students s JOIN classes c ON c.id = s.class_id JOIN teachers t ON t.id = c.teacher_id
     ORDER BY s.created_at DESC`
  ).all();
  const classes = await db.prepare(
    `SELECT c.id, c.teacher_id, c.name, c.code, c.status, c.created_at,
      t.name AS teacher_name, t.email AS teacher_email,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
     FROM classes c JOIN teachers t ON t.id = c.teacher_id ORDER BY c.created_at DESC`
  ).all();
  const courses = await db.prepare(
    `SELECT c.id, c.title, c.summary, c.status, c.updated_at, c.current_version_id,
      t.name AS owner_name, t.email AS owner_email,
      COALESCE(cv.version_no, latest.version_no, 1) AS version_no,
      COALESCE(cv.status, latest.status, c.status) AS version_status,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_version_id = COALESCE(c.current_version_id, latest.id)) AS lesson_count,
      (SELECT COUNT(*) FROM class_courses cc JOIN course_versions used ON used.id = cc.course_version_id
       WHERE used.course_id = c.id AND cc.status = 'active') AS adoption_count
     FROM courses c JOIN teachers t ON t.id = c.owner_teacher_id
     LEFT JOIN course_versions cv ON cv.id = c.current_version_id
     LEFT JOIN course_versions latest ON latest.id = (
       SELECT id FROM course_versions WHERE course_id = c.id ORDER BY version_no DESC LIMIT 1
     ) ORDER BY CASE c.status WHEN 'published' THEN 0 WHEN 'review' THEN 1 ELSE 2 END, c.updated_at DESC`
  ).all();
  const permissions = await db.prepare("SELECT teacher_id, course_id, allowed FROM teacher_course_permissions").all();
  const activity = await db.prepare(
    `SELECT a.id, a.user_type, a.user_id, a.action, a.detail_json, a.created_at,
      CASE WHEN a.user_type = 'teacher' THEN (SELECT name FROM teachers WHERE id = a.user_id)
           ELSE (SELECT nickname FROM students WHERE id = a.user_id) END AS user_name
     FROM user_activity_logs a ORDER BY a.created_at DESC LIMIT 80`
  ).all();
  return Response.json({
    teachers: teachers.results ?? [], students: students.results ?? [],
    users: [...(teachers.results ?? []).map((item) => ({ ...item, user_type: "teacher" })), ...(students.results ?? []).map((item) => ({ ...item, user_type: "student" }))],
    classes: classes.results ?? [], courses: courses.results ?? [], permissions: permissions.results ?? [], activity: activity.results ?? [],
    fileStorage: referenceStorageStatus(),
  });
}
