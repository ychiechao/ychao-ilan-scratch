import { env } from "cloudflare:workers";

type FirebaseErrorResponse = {
  error?: {
    message?: string;
  };
};

export type FirebaseUser = {
  localId: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
};

export class FirebaseAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function apiKey() {
  const value = (env as unknown as { FIREBASE_WEB_API_KEY?: string }).FIREBASE_WEB_API_KEY;
  if (!value) {
    throw new FirebaseAuthError(
      "Firebase 登入尚未設定，請設定 FIREBASE_WEB_API_KEY。",
      "CONFIGURATION_NOT_FOUND",
      503,
    );
  }
  return value;
}

function friendlyError(code: string) {
  const messages: Record<string, string> = {
    USER_DISABLED: "這個 Firebase 帳號已停用。",
    INVALID_ID_TOKEN: "Google 登入已失效，請重新登入。",
    TOKEN_EXPIRED: "Google 登入已逾時，請重新登入。",
    TOO_MANY_ATTEMPTS_TRY_LATER: "嘗試次數過多，請稍後再試。",
  };
  return messages[code] ?? "Google 登入驗證失敗，請重新登入。";
}

async function callFirebase<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey())}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = (await response.json().catch(() => ({}))) as T & FirebaseErrorResponse;
  if (!response.ok) {
    const rawCode = data.error?.message ?? "FIREBASE_AUTH_ERROR";
    const code = rawCode.split(" : ")[0];
    throw new FirebaseAuthError(friendlyError(code), code, response.status === 429 ? 429 : 400);
  }
  return data;
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (!idToken) {
    throw new FirebaseAuthError("請先使用 Google 登入。", "MISSING_ID_TOKEN", 401);
  }
  const result = await callFirebase<{ users?: FirebaseUser[] }>("accounts:lookup", { idToken });
  const user = result.users?.[0];
  if (!user?.localId || !user.email) {
    throw new FirebaseAuthError("Google 登入資料不完整，請重新登入。", "INVALID_ID_TOKEN", 401);
  }
  return user;
}
