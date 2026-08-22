import { cleanText, getStudentProgress, jsonError } from "../../_lib";
import { ensureDb } from "../../../../db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = cleanText(searchParams.get("studentId"), 80);

  if (!studentId) {
    return jsonError("缺少學生資料。");
  }

  const db = await ensureDb();
  const student = await db
    .prepare("SELECT id, class_id, seat_no, nickname, created_at FROM students WHERE id = ?")
    .bind(studentId)
    .first();

  if (!student) {
    return jsonError("找不到學生。", 404);
  }

  const classRow = await db
    .prepare("SELECT id, teacher_id, name, code, created_at FROM classes WHERE id = ?")
    .bind((student as { class_id: string }).class_id)
    .first();
  const progress = await getStudentProgress(studentId);

  return Response.json({ student, class: classRow, ...progress });
}
