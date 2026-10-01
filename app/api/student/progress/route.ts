import { getStudentProgress, jsonError, publicClass } from "../../_lib";
import { ensureDb } from "../../../../db";
import { requireStudent } from "../../auth";

export async function GET(request: Request) {
  const actor = await requireStudent(request);
  if (actor instanceof Response) return actor;
  const studentId = actor.student.id;

  const db = await ensureDb();
  const student = await db
    .prepare(
      `SELECT s.id, s.class_id, s.seat_no, s.nickname, s.email, s.created_at
       FROM students s JOIN classes c ON c.id = s.class_id JOIN teachers t ON t.id = c.teacher_id
       WHERE s.id = ? AND c.status = 'active' AND t.status = 'active'`
    )
    .bind(studentId)
    .first();

  if (!student) {
    return jsonError("找不到學生。", 404);
  }

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind((student as { class_id: string }).class_id)
    .first();
  const progress = await getStudentProgress(studentId);

  return Response.json({ student, class: publicClass(classRow as never), ...progress });
}
