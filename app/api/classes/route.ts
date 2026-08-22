import { cleanText, createId, generateClassCode, jsonError, publicClass } from "../_lib";
import { ensureDb } from "../../../db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    teacherId?: string;
    name?: string;
  } | null;

  const teacherId = cleanText(payload?.teacherId, 80);
  const name = cleanText(payload?.name) || "Scratch 基礎班";

  if (!teacherId) {
    return jsonError("缺少老師資料，請重新登入。");
  }

  const db = await ensureDb();
  const teacher = await db
    .prepare("SELECT id FROM teachers WHERE id = ?")
    .bind(teacherId)
    .first();

  if (!teacher) {
    return jsonError("找不到老師帳號。", 404);
  }

  const classId = createId("cls");
  const code = await generateClassCode();
  await db
    .prepare(
      "INSERT INTO classes (id, teacher_id, name, code) VALUES (?, ?, ?, ?)"
    )
    .bind(classId, teacherId, name, code)
    .run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(classId)
    .first();

  return Response.json({ class: publicClass(classRow as never) }, { status: 201 });
}
