import {
  cleanText,
  createId,
  generateClassCode,
  hashPin,
  jsonError,
  publicClass,
} from "../../_lib";
import { ensureDb } from "../../../../db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    pin?: string;
    className?: string;
  } | null;

  const name = cleanText(payload?.name);
  const email = cleanText(payload?.email, 120).toLowerCase();
  const pin = cleanText(payload?.pin, 12);
  const className = cleanText(payload?.className) || "Scratch 基礎班";

  if (!name || !email || pin.length < 4) {
    return jsonError("請輸入老師名稱、Email 與至少 4 碼 PIN。");
  }

  const db = await ensureDb();
  const existing = await db
    .prepare("SELECT id FROM teachers WHERE email = ?")
    .bind(email)
    .first();

  if (existing) {
    return jsonError("這個 Email 已經註冊，請改用登入。");
  }

  const teacherId = createId("tea");
  const teacherPinHash = await hashPin(email, pin);
  await db
    .prepare(
      "INSERT INTO teachers (id, name, email, pin_hash) VALUES (?, ?, ?, ?)"
    )
    .bind(teacherId, name, email, teacherPinHash)
    .run();

  const classId = createId("cls");
  const code = await generateClassCode();
  await db
    .prepare(
      "INSERT INTO classes (id, teacher_id, name, code) VALUES (?, ?, ?, ?)"
    )
    .bind(classId, teacherId, className, code)
    .run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(classId)
    .first();

  return Response.json({
    teacher: { id: teacherId, name, email },
    classes: classRow ? [publicClass(classRow as never)] : [],
  });
}
