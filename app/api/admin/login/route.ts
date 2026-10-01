import { ensureDb } from "../../../../db";
import { cleanText, jsonError } from "../../_lib";
import { createAdminSession } from "../_auth";
import { FirebaseAuthError, verifyFirebaseIdToken } from "../../firebase-auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { idToken?: string } | null;
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdToken(cleanText(payload?.idToken, 4096));
  } catch (error) {
    if (error instanceof FirebaseAuthError) return jsonError(error.message, error.status);
    return jsonError("Google 登入驗證失敗。", 401);
  }
  const email = firebaseUser.email.toLowerCase();

  const db = await ensureDb();
  const admin = await db
    .prepare("SELECT id, name, email, status FROM teachers WHERE email = ? AND role = 'superadmin'")
    .bind(email)
    .first<{ id: string; name: string; email: string; status: string }>();
  if (!admin || admin.status !== "active") {
    return jsonError("這個 Google 帳號沒有超級管理者權限。", 401);
  }
  return Response.json(
    { admin: { id: admin.id, name: admin.name, email: admin.email } },
    { headers: { "set-cookie": await createAdminSession(admin.id) } }
  );
}
