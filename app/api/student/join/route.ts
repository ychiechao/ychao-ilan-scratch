import {
  cleanText,
  createId,
  hashPin,
  isValidEmail,
  jsonError,
  normalizeClassCode,
  normalizeEmail,
  publicClass,
  publicStudent,
} from "../../_lib";
import { ensureDb } from "../../../../db";
import { FirebaseAuthError, verifyFirebaseIdToken } from "../../firebase-auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    classCode?: string;
    seatNo?: string;
    nickname?: string;
    idToken?: string;
  } | null;

  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdToken(cleanText(payload?.idToken, 4096));
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("Google 登入驗證失敗。", 401);
  }
  const classCode = normalizeClassCode(cleanText(payload?.classCode, 20));
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(firebaseUser.email);

  if (!classCode || !seatNo || !nickname || !isValidEmail(email)) {
    return jsonError("請輸入班級代碼、座號與暱稱，並使用 Google 登入。");
  }

  const db = await ensureDb();
  const classRow = await db
    .prepare(
      `SELECT c.*, t.school_name AS teacher_school FROM classes c
       JOIN teachers t ON t.id = c.teacher_id
       WHERE c.code = ? AND c.status = 'active' AND c.enrollment_enabled = 1 AND t.status = 'active'`
    )
    .bind(classCode)
    .first();

  if (!classRow) {
    return jsonError("找不到可加入的班級，請確認班級已通過審核且老師已開放加入。", 404);
  }

  const existing = await db
    .prepare("SELECT * FROM students WHERE class_id = ? AND seat_no = ?")
    .bind((classRow as { id: string }).id, seatNo)
    .first();

  const pinHash = await hashPin(`${(classRow as { id: string }).id}:${seatNo}`, `firebase:${firebaseUser.localId}`);

  if (existing) {
    const student = existing as { id: string; email?: string | null; status?: string };
    if (student.status === "disabled") {
      return jsonError("學生帳號已停用，請聯絡老師。", 403);
    }
    if (student.email && normalizeEmail(student.email) !== email) {
      return jsonError("這個座號已綁定其他 Google 帳號。", 401);
    }

    await db
      .prepare("UPDATE students SET nickname = ?, email = ?, firebase_uid = ?, school_name = CASE WHEN school_name = '' THEN ? ELSE school_name END, last_login_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(nickname, email, firebaseUser.localId, String((classRow as { teacher_school?: string }).teacher_school ?? ""), student.id)
      .run();
    await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action) VALUES (?, 'student', ?, 'join_class')")
      .bind(createId("activity"), student.id).run();
    const updated = await db
      .prepare("SELECT * FROM students WHERE id = ?")
      .bind(student.id)
      .first();

    return Response.json({
      class: publicClass(classRow as never),
      student: publicStudent(updated as never),
    });
  }

  const existingMembership = await db
    .prepare("SELECT seat_no FROM students WHERE class_id = ? AND (email = ? OR firebase_uid = ?)")
    .bind((classRow as { id: string }).id, email, firebaseUser.localId)
    .first<{ seat_no: string }>();
  if (existingMembership) {
    return jsonError(`你已經用 ${existingMembership.seat_no} 號加入這個班級。`, 409);
  }

  const studentId = createId("stu");
  try {
    await db
      .prepare(
        "INSERT INTO students (id, class_id, seat_no, nickname, email, firebase_uid, pin_hash, school_name, last_login_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      )
      .bind(studentId, (classRow as { id: string }).id, seatNo, nickname, email, firebaseUser.localId, pinHash, String((classRow as { teacher_school?: string }).teacher_school ?? ""))
      .run();
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("這個座號已被使用，請和老師確認。", 409);
  }

  const student = await db
    .prepare("SELECT * FROM students WHERE id = ?")
    .bind(studentId)
    .first();
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action) VALUES (?, 'student', ?, 'join_class')")
    .bind(createId("activity"), studentId).run();

  return Response.json(
    {
      class: publicClass(classRow as never),
      student: publicStudent(student as never),
    },
    { status: 201 }
  );
}
