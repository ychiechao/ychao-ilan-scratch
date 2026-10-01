import {
  cleanText,
  createId,
  generateClassCode,
  hashPin,
  jsonError,
  publicClass,
} from "../../_lib";
import { ensureDb } from "../../../../db";
import { FirebaseAuthError, verifyFirebaseIdToken } from "../../firebase-auth";

const SUPERADMIN_EMAIL = "ychao.ilc@smail.ilc.edu.tw";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    name?: string;
    idToken?: string;
    className?: string;
  } | null;

  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdToken(cleanText(payload?.idToken, 4096));
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("Google 登入驗證失敗。", 401);
  }
  const name = cleanText(payload?.name) || firebaseUser.displayName || "老師";
  const email = firebaseUser.email.toLowerCase();
  const className = cleanText(payload?.className) || "Scratch 基礎班";

  const db = await ensureDb();
  const existing = await db
    .prepare("SELECT id FROM teachers WHERE email = ?")
    .bind(email)
    .first();

  if (existing) {
    return jsonError("這個 Email 已經註冊，請改用登入。");
  }

  const teacherId = createId("tea");
  const teacherPinHash = await hashPin(email, `firebase:${firebaseUser.localId}`);
  const role = email === SUPERADMIN_EMAIL ? "superadmin" : "teacher";
  const status = role === "superadmin" ? "active" : "pending";
  await db
    .prepare(
      "INSERT INTO teachers (id, name, email, firebase_uid, pin_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(teacherId, name, email, firebaseUser.localId, teacherPinHash, role, status)
    .run();

  if (role === "superadmin") {
    return Response.json({
      teacher: { id: teacherId, name, email, role, status, mustChangePin: false },
      classes: [],
    });
  }

  const classId = createId("cls");
  const code = await generateClassCode();
  await db
    .prepare(
      "INSERT INTO classes (id, teacher_id, name, code, status) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(classId, teacherId, className, code, "pending")
    .run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(classId)
    .first();

  return Response.json({
    teacher: { id: teacherId, name, email, role, status, mustChangePin: false },
    classes: classRow ? [publicClass(classRow as never)] : [],
  });
}
