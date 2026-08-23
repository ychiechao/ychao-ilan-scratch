import { ensureDb } from "../../../db";
import { jsonError } from "../_lib";

const COOKIE_NAME = "scratch_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function createAdminSession(adminId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const db = await ensureDb();
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)).run();
  await db.prepare("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)").bind(await tokenHash(token), adminId, expiresAt).run();
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export async function requireAdmin(request: Request) {
  const token = cookieValue(request);
  if (!token) return null;
  const db = await ensureDb();
  return db
    .prepare(
      `SELECT t.id, t.name, t.email FROM admin_sessions s
       JOIN teachers t ON t.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at >= ? AND t.role = 'superadmin' AND t.status = 'active'`
    )
    .bind(await tokenHash(token), Math.floor(Date.now() / 1000))
    .first<{ id: string; name: string; email: string }>();
}

export async function destroyAdminSession(request: Request) {
  const token = cookieValue(request);
  if (token) {
    const db = await ensureDb();
    await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await tokenHash(token)).run();
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` } }
  );
}

export function adminError() {
  return jsonError("超管登入已失效，請重新登入。", 401);
}
