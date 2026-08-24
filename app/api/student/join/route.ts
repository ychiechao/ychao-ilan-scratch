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

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    classCode?: string;
    seatNo?: string;
    nickname?: string;
    email?: string;
    pin?: string;
  } | null;

  const classCode = normalizeClassCode(cleanText(payload?.classCode, 20));
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const email = normalizeEmail(payload?.email);
  const pin = cleanText(payload?.pin, 12);

  if (!classCode || !seatNo || !nickname || !isValidEmail(email) || pin.length < 4) {
    return jsonError("請輸入班級代碼、座號、暱稱、正確的 Email 與至少 4 碼 PIN。");
  }

  const db = await ensureDb();
  const classRow = await db
    .prepare(
      `SELECT c.* FROM classes c
       JOIN teachers t ON t.id = c.teacher_id
       WHERE c.code = ? AND c.status = 'active' AND t.status = 'active'`
    )
    .bind(classCode)
    .first();

  if (!classRow) {
    return jsonError("找不到已啟用的班級，請請老師確認班級已通過審核。", 404);
  }

  const existing = await db
    .prepare("SELECT * FROM students WHERE class_id = ? AND seat_no = ?")
    .bind((classRow as { id: string }).id, seatNo)
    .first();

  const pinHash = await hashPin(`${(classRow as { id: string }).id}:${seatNo}`, pin);

  if (existing) {
    const student = existing as { pin_hash: string; id: string };
    if (student.pin_hash !== pinHash) {
      return jsonError("這個座號已加入班級，PIN 不正確。", 401);
    }

    const emailOwner = await db
      .prepare("SELECT id FROM students WHERE email = ? AND id <> ?")
      .bind(email, student.id)
      .first();
    if (emailOwner) {
      return jsonError("這個 Email 已經綁定其他學生帳號。", 409);
    }

    await db
      .prepare("UPDATE students SET nickname = ?, email = ? WHERE id = ?")
      .bind(nickname, email, student.id)
      .run();
    const updated = await db
      .prepare("SELECT * FROM students WHERE id = ?")
      .bind(student.id)
      .first();

    return Response.json({
      class: publicClass(classRow as never),
      student: publicStudent(updated as never),
    });
  }

  const studentId = createId("stu");
  try {
    await db
      .prepare(
        "INSERT INTO students (id, class_id, seat_no, nickname, email, pin_hash) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(studentId, (classRow as { id: string }).id, seatNo, nickname, email, pinHash)
      .run();
  } catch {
    return jsonError("這個 Email 已經綁定其他學生帳號。", 409);
  }

  const student = await db
    .prepare("SELECT * FROM students WHERE id = ?")
    .bind(studentId)
    .first();

  return Response.json(
    {
      class: publicClass(classRow as never),
      student: publicStudent(student as never),
    },
    { status: 201 }
  );
}
