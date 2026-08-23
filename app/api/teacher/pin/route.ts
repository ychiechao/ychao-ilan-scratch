import { ensureDb } from "../../../../db";
import { cleanText, hashPin, jsonError } from "../../_lib";

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as { teacherId?: string; currentPin?: string; newPin?: string } | null;
  const teacherId = cleanText(payload?.teacherId, 80);
  const currentPin = cleanText(payload?.currentPin, 12);
  const newPin = cleanText(payload?.newPin, 12);
  if (!teacherId || currentPin.length < 4 || newPin.length < 4) return jsonError("請輸入目前 PIN 與至少 4 碼的新 PIN。");

  const db = await ensureDb();
  const teacher = await db.prepare("SELECT email, pin_hash FROM teachers WHERE id = ?").bind(teacherId).first<{ email: string; pin_hash: string }>();
  if (!teacher || teacher.pin_hash !== (await hashPin(teacher.email, currentPin))) return jsonError("目前 PIN 不正確。", 401);
  await db.prepare("UPDATE teachers SET pin_hash = ?, must_change_pin = 0 WHERE id = ?").bind(await hashPin(teacher.email, newPin), teacherId).run();
  return Response.json({ ok: true });
}
