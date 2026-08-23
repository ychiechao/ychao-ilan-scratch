import {
  cleanText,
  createId,
  hashPin,
  jsonError,
  normalizeClassCode,
  publicClass,
  publicStudent,
} from "../../_lib";
import { ensureDb } from "../../../../db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    classCode?: string;
    seatNo?: string;
    nickname?: string;
    pin?: string;
  } | null;

  const classCode = normalizeClassCode(cleanText(payload?.classCode, 20));
  const seatNo = cleanText(payload?.seatNo, 10);
  const nickname = cleanText(payload?.nickname, 40);
  const pin = cleanText(payload?.pin, 12);

  if (!classCode || !seatNo || !nickname || pin.length < 4) {
    return jsonError("請輸入班級代碼、座號、暱稱與至少 4 碼 PIN。");
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

    await db
      .prepare("UPDATE students SET nickname = ? WHERE id = ?")
      .bind(nickname, student.id)
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
  await db
    .prepare(
      "INSERT INTO students (id, class_id, seat_no, nickname, pin_hash) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(studentId, (classRow as { id: string }).id, seatNo, nickname, pinHash)
    .run();

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
