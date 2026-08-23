import { chapters } from "../../../course-data";
import { cleanText, jsonError } from "../../_lib";
import { ensureDb } from "../../../../db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = cleanText(searchParams.get("teacherId"), 80);
  const classId = cleanText(searchParams.get("classId"), 80);

  if (!teacherId || !classId) {
    return jsonError("缺少老師或班級資料。");
  }

  const db = await ensureDb();
  const classRow = await db
    .prepare(
      `SELECT c.* FROM classes c
       JOIN teachers t ON t.id = c.teacher_id
       WHERE c.id = ? AND c.teacher_id = ? AND t.status = 'active'`
    )
    .bind(classId, teacherId)
    .first();

  if (!classRow) {
    return jsonError("找不到班級，或這不是你的班級。", 404);
  }

  const students = await db
    .prepare(
      `SELECT id, class_id, seat_no, nickname, created_at
       FROM students
       WHERE class_id = ?
       ORDER BY CAST(seat_no AS INTEGER), seat_no`
    )
    .bind(classId)
    .all();
  const submissions = await db
    .prepare(
      `SELECT s.id, s.student_id, s.chapter_no, s.file_name, s.file_size,
        s.auto_score, s.status, s.external_status, s.feedback, s.updated_at
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

  return Response.json({
    class: classRow,
    chapters,
    students: students.results ?? [],
    submissions: submissions.results ?? [],
    badges: badges.results ?? [],
  });
}
