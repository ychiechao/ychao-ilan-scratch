import {
  cleanText,
  hashPin,
  isValidEmail,
  jsonError,
  normalizeEmail,
  publicClass,
  publicStudent,
} from "../../_lib";
import { ensureDb } from "../../../../db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    email?: string;
    pin?: string;
  } | null;

  const email = normalizeEmail(payload?.email);
  const pin = cleanText(payload?.pin, 12);
  if (!isValidEmail(email) || pin.length < 4) {
    return jsonError("請輸入 Email 與至少 4 碼 PIN。");
  }

  const db = await ensureDb();
  const student = await db
    .prepare(
      `SELECT s.* FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN teachers t ON t.id = c.teacher_id
       WHERE s.email = ? AND c.status = 'active' AND t.status = 'active'`
    )
    .bind(email)
    .first<{
      id: string;
      class_id: string;
      seat_no: string;
      nickname: string;
      email: string;
      pin_hash: string;
      created_at: string;
    }>();

  if (!student || student.pin_hash !== (await hashPin(`${student.class_id}:${student.seat_no}`, pin))) {
    return jsonError("Email 或 PIN 不正確。", 401);
  }

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(student.class_id)
    .first();

  return Response.json({
    student: publicStudent(student),
    class: publicClass(classRow as never),
  });
}
