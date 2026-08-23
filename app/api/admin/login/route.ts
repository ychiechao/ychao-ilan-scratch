import { ensureDb } from "../../../../db";
import { cleanText, hashPin, jsonError } from "../../_lib";
import { createAdminSession } from "../_auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { email?: string; pin?: string } | null;
  const email = cleanText(payload?.email, 120).toLowerCase();
  const pin = cleanText(payload?.pin, 12);
  if (!email || pin.length < 4) return jsonError("請輸入超管 Email 與 PIN。");

  const db = await ensureDb();
  const admin = await db
    .prepare("SELECT id, name, email, pin_hash, status FROM teachers WHERE email = ? AND role = 'superadmin'")
    .bind(email)
    .first<{ id: string; name: string; email: string; pin_hash: string; status: string }>();
  if (!admin || admin.status !== "active" || admin.pin_hash !== (await hashPin(email, pin))) {
    return jsonError("超管 Email 或 PIN 不正確。", 401);
  }
  return Response.json(
    { admin: { id: admin.id, name: admin.name, email: admin.email } },
    { headers: { "set-cookie": await createAdminSession(admin.id) } }
  );
}
