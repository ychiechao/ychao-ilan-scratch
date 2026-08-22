import { cleanText, hashPin, jsonError, publicClass } from "../../_lib";
import { ensureDb } from "../../../../db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    email?: string;
    pin?: string;
  } | null;

  const email = cleanText(payload?.email, 120).toLowerCase();
  const pin = cleanText(payload?.pin, 12);

  if (!email || pin.length < 4) {
    return jsonError("請輸入 Email 與 PIN。");
  }

  const db = await ensureDb();
  const teacher = await db
    .prepare("SELECT id, name, email, pin_hash FROM teachers WHERE email = ?")
    .bind(email)
    .first<{ id: string; name: string; email: string; pin_hash: string }>();

  if (!teacher || teacher.pin_hash !== (await hashPin(email, pin))) {
    return jsonError("Email 或 PIN 不正確。", 401);
  }

  const classes = await db
    .prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC")
    .bind(teacher.id)
    .all();

  return Response.json({
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    classes: (classes.results ?? []).map((row) => publicClass(row as never)),
  });
}
