import {
  cleanText,
  createId,
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
  const memberships = await db
    .prepare(
      `SELECT s.*, c.name AS class_name, c.code AS class_code FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN teachers t ON t.id = c.teacher_id
       WHERE (s.email = ? OR s.firebase_uid = ?) AND s.status = 'active'
         AND c.status = 'active' AND t.status = 'active'
       ORDER BY COALESCE(s.last_active_at, s.created_at) DESC`
    )
    .bind(email, firebaseUser.localId)
    .all<{
      id: string;
      class_id: string;
      seat_no: string;
      nickname: string;
      email: string;
      pin_hash: string;
      created_at: string;
      class_name: string;
      class_code: string;
    }>();
  const student = memberships.results?.[0];

  if (!student) {
    return jsonError("找不到這個 Google 帳號的學生資料，請先加入班級。", 401);
  }
  await db.prepare("UPDATE students SET firebase_uid = ?, last_login_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE email = ? OR firebase_uid = ?")
    .bind(firebaseUser.localId, email, firebaseUser.localId).run();
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action) VALUES (?, 'student', ?, 'login')")
    .bind(createId("activity"), student.id).run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(student.class_id)
    .first();

  return Response.json({
    student: publicStudent(student),
    class: publicClass(classRow as never),
    memberships: (memberships.results ?? []).map((membership) => ({
      student: publicStudent(membership),
      class: {
        id: membership.class_id,
        name: membership.class_name,
        code: membership.class_code,
      },
    })),
  });
}
