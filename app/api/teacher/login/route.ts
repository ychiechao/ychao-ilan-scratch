import { cleanText, createId, jsonError, publicClass } from "../../_lib";
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
  const teacher = await db
    .prepare("SELECT id, name, email, pin_hash, role, status, must_change_pin FROM teachers WHERE email = ?")
    .bind(email)
    .first<{ id: string; name: string; email: string; pin_hash: string; role: string; status: string; must_change_pin: number }>();

  if (!teacher) {
    return jsonError("這個 Google 帳號尚未註冊老師身分。", 401);
  }
  await db.prepare("UPDATE teachers SET firebase_uid = ?, last_login_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(firebaseUser.localId, teacher.id).run();
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action) VALUES (?, 'teacher', ?, 'login')")
    .bind(createId("activity"), teacher.id).run();

  const classes = await db
    .prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC")
    .bind(teacher.id)
    .all();

  return Response.json({
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      role: teacher.role,
      status: teacher.status,
      mustChangePin: Boolean(teacher.must_change_pin),
    },
    classes: (classes.results ?? []).map((row) => publicClass(row as never)),
  });
}
