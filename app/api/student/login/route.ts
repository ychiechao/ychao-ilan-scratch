import {
  cleanText,
  jsonError,
  publicClass,
  publicStudent,
} from "../../_lib";
import { ensureDb } from "../../../../db";
import { FirebaseAuthError, verifyFirebaseIdToken } from "../../firebase-auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    idToken?: string;
  } | null;

  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdToken(cleanText(payload?.idToken, 4096));
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("Google 登入驗證失敗。", 401);
  }
  const email = firebaseUser.email.toLowerCase();

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

  if (!student) {
    return jsonError("找不到這個 Google 帳號的學生資料，請先加入班級。", 401);
  }
  await db.prepare("UPDATE students SET firebase_uid = ? WHERE id = ?")
    .bind(firebaseUser.localId, student.id).run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(student.class_id)
    .first();

  return Response.json({
    student: publicStudent(student),
    class: publicClass(classRow as never),
  });
}
