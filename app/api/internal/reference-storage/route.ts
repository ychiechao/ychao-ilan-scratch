import { jsonError } from "../../_lib";
import { storageEnvironment, validateReferenceStorageKey } from "../../reference-storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function PUT(request: Request) {
  if (!(await authorized(request))) return jsonError("儲存服務驗證失敗。", 401);
  const key = storageKey(request);
  if (key instanceof Response) return key;
  const contentLength = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_FILE_SIZE) {
    return jsonError("Scratch 檔案必須小於 20 MB。", 413);
  }
  const sha256 = request.headers.get("x-file-sha256")?.toLowerCase() ?? "";
  if (!/^[a-f0-9]{64}$/.test(sha256)) return jsonError("檔案雜湊不正確。");
  const encodedName = request.headers.get("x-file-name") ?? "";
  let fileName = "reference.sb3";
  try {
    fileName = decodeURIComponent(encodedName).slice(0, 180);
  } catch {
    return jsonError("檔名格式不正確。");
  }
  if (!fileName.toLowerCase().endsWith(".sb3")) return jsonError("只接受 Scratch .sb3 檔案。");
  const namespace = storageEnvironment().REFERENCE_FILES;
  if (!namespace) return jsonError("Cloudflare KV 綁定尚未設定。", 503);
  await namespace.put(key, request.body, {
    metadata: {
      fileName,
      contentType: "application/x.scratch.sb3",
      fileSize: contentLength,
      sha256,
    },
  });
  return Response.json({ ok: true }, { status: 201 });
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return jsonError("儲存服務驗證失敗。", 401);
  const key = storageKey(request);
  if (key instanceof Response) return key;
  const namespace = storageEnvironment().REFERENCE_FILES;
  if (!namespace) return jsonError("Cloudflare KV 綁定尚未設定。", 503);
  const object = await namespace.getWithMetadata<{ fileSize?: number }>(key, "stream");
  if (!object.value) return jsonError("參考作品不存在。", 404);
  const headers = new Headers({
    "content-type": "application/x.scratch.sb3",
    "cache-control": "private, no-store",
  });
  if (object.metadata?.fileSize) headers.set("content-length", String(object.metadata.fileSize));
  return new Response(object.value, { headers });
}

export async function DELETE(request: Request) {
  if (!(await authorized(request))) return jsonError("儲存服務驗證失敗。", 401);
  const key = storageKey(request);
  if (key instanceof Response) return key;
  const namespace = storageEnvironment().REFERENCE_FILES;
  if (!namespace) return jsonError("Cloudflare KV 綁定尚未設定。", 503);
  await namespace.delete(key);
  return Response.json({ ok: true });
}

function storageKey(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    validateReferenceStorageKey(key);
    return key;
  } catch {
    return jsonError("參考作品儲存鍵不正確。");
  }
}

async function authorized(request: Request) {
  const configured = storageEnvironment().REFERENCE_STORAGE_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (configured.length < 32 || provided.length !== configured.length) return false;
  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(configured)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const expectedBytes = new Uint8Array(expected);
  const actualBytes = new Uint8Array(actual);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) difference |= expectedBytes[index] ^ actualBytes[index];
  return difference === 0;
}
