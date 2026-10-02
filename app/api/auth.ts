import { ensureDb } from "../../db";
import { FirebaseAuthError, verifyFirebaseIdToken, type FirebaseUser } from "./firebase-auth";
import { jsonError } from "./_lib";

export type AuthActor = {
  firebase: FirebaseUser;
  teacher: { id: string; name: string; email: string; role: string; status: string } | null;
  student: { id: string; classId: string; nickname: string; email: string } | null;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function requireActor(request: Request): Promise<AuthActor | Response> {
  let firebase: FirebaseUser;
  try {
    firebase = await verifyFirebaseIdToken(bearerToken(request));
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("Google 登入驗證失敗。", 401);
  }

  const email = firebase.email.toLowerCase();
  const db = await ensureDb();
  await db.prepare("UPDATE teachers SET firebase_uid = ? WHERE email = ? AND (firebase_uid IS NULL OR firebase_uid = '')")
    .bind(firebase.localId, email).run();
  await db.prepare("UPDATE students SET firebase_uid = ? WHERE email = ? AND (firebase_uid IS NULL OR firebase_uid = '')")
    .bind(firebase.localId, email).run();

  const teacher = await db.prepare(
    "SELECT id, name, email, role, status FROM teachers WHERE firebase_uid = ? OR email = ?"
  ).bind(firebase.localId, email).first<{ id: string; name: string; email: string; role: string; status: string }>();
  const student = await db.prepare(
    `SELECT s.id, s.class_id, s.nickname, s.email FROM students s
     JOIN classes c ON c.id = s.class_id JOIN teachers t ON t.id = c.teacher_id
     WHERE (s.firebase_uid = ? OR s.email = ?) AND s.status = 'active' AND c.status = 'active' AND t.status = 'active'`
  ).bind(firebase.localId, email).first<{ id: string; class_id: string; nickname: string; email: string }>();

  if (teacher) await db.prepare("UPDATE teachers SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?").bind(teacher.id).run();
  if (student) await db.prepare("UPDATE students SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?").bind(student.id).run();

  return {
    firebase,
    teacher: teacher ?? null,
    student: student ? { id: student.id, classId: student.class_id, nickname: student.nickname, email: student.email } : null,
  };
}

export async function requireTeacher(request: Request) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  if (!actor.teacher) return jsonError("找不到教師帳號。", 403);
  if (actor.teacher.status !== "active") return jsonError("教師帳號尚未啟用。", 403);
  return { ...actor, teacher: actor.teacher };
}

export async function requireStudent(request: Request) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  if (!actor.student) return jsonError("找不到學生帳號。", 403);
  return { ...actor, student: actor.student };
}

export async function requireSuperadmin(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  if (actor.teacher.role !== "superadmin") return jsonError("需要超級管理者權限。", 403);
  return actor;
}
