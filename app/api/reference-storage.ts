import { env } from "cloudflare:workers";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const STORAGE_PATH = "/api/internal/reference-storage";

type ReferenceStorageEnv = {
  REFERENCE_FILES?: KVNamespace;
  REFERENCE_STORAGE_URL?: string;
  REFERENCE_STORAGE_SECRET?: string;
};

type ReferenceMetadata = {
  fileName: string;
  contentType: string;
  fileSize: number;
  sha256: string;
};

export class ReferenceStorageError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
  }
}

export function referenceStorageStatus() {
  const configured = storageEnvironment();
  if (configured.REFERENCE_FILES) {
    return {
      configured: true,
      provider: "Cloudflare Workers KV",
      mode: "direct",
      maxFileSizeMb: 20,
    };
  }
  if (remoteConfiguration(configured)) {
    return {
      configured: true,
      provider: "Cloudflare Workers KV",
      mode: "worker_service",
      maxFileSizeMb: 20,
    };
  }
  return {
    configured: false,
    provider: "Cloudflare Workers KV",
    mode: "unavailable",
    maxFileSizeMb: 20,
  };
}

export async function uploadReferenceFile(
  key: string,
  body: ReadableStream<Uint8Array>,
  metadata: ReferenceMetadata,
) {
  validateKey(key);
  if (metadata.fileSize <= 0 || metadata.fileSize > MAX_FILE_SIZE) {
    throw new ReferenceStorageError("Scratch 檔案必須小於 20 MB。", 413);
  }
  const configured = storageEnvironment();
  if (configured.REFERENCE_FILES) {
    await configured.REFERENCE_FILES.put(key, body, { metadata });
    return;
  }
  const remote = remoteConfiguration(configured);
  if (!remote) throw unavailableError();
  const response = await fetch(storageUrl(remote.url, key), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${remote.secret}`,
      "content-type": metadata.contentType,
      "content-length": String(metadata.fileSize),
      "x-file-name": encodeURIComponent(metadata.fileName),
      "x-file-sha256": metadata.sha256,
    },
    body,
  });
  if (!response.ok) throw await remoteError(response, "無法寫入 Cloudflare KV。");
}

export async function downloadReferenceFile(key: string) {
  validateKey(key);
  const configured = storageEnvironment();
  if (configured.REFERENCE_FILES) {
    const object = await configured.REFERENCE_FILES.getWithMetadata<ReferenceMetadata>(key, "stream");
    if (!object.value) throw new ReferenceStorageError("參考作品不存在。", 404);
    return { body: object.value, metadata: object.metadata };
  }
  const remote = remoteConfiguration(configured);
  if (!remote) throw unavailableError();
  const response = await fetch(storageUrl(remote.url, key), {
    headers: { authorization: `Bearer ${remote.secret}` },
  });
  if (!response.ok) throw await remoteError(response, "無法讀取 Cloudflare KV 參考作品。");
  if (!response.body) throw new ReferenceStorageError("參考作品不存在。", 404);
  return { body: response.body, metadata: null };
}

export async function deleteReferenceFile(key: string) {
  validateKey(key);
  const configured = storageEnvironment();
  if (configured.REFERENCE_FILES) {
    await configured.REFERENCE_FILES.delete(key);
    return;
  }
  const remote = remoteConfiguration(configured);
  if (!remote) throw unavailableError();
  const response = await fetch(storageUrl(remote.url, key), {
    method: "DELETE",
    headers: { authorization: `Bearer ${remote.secret}` },
  });
  if (!response.ok && response.status !== 404) throw await remoteError(response, "無法清除 Cloudflare KV 檔案。");
}

export function storageEnvironment() {
  return env as unknown as ReferenceStorageEnv;
}

export function validateReferenceStorageKey(key: string) {
  validateKey(key);
}

function remoteConfiguration(configured: ReferenceStorageEnv) {
  const url = configured.REFERENCE_STORAGE_URL?.trim();
  const secret = configured.REFERENCE_STORAGE_SECRET?.trim();
  if (!url || !secret || secret.length < 32) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  return { url: parsed.origin, secret };
}

function storageUrl(origin: string, key: string) {
  const url = new URL(STORAGE_PATH, origin);
  url.searchParams.set("key", key);
  return url;
}

function validateKey(key: string) {
  if (!/^reference\/[a-zA-Z0-9_-]{8,100}\.sb3$/.test(key)) {
    throw new ReferenceStorageError("參考作品儲存鍵不正確。", 400);
  }
}

function unavailableError() {
  return new ReferenceStorageError("Cloudflare KV 尚未連線，請通知網站管理者。", 503);
}

async function remoteError(response: Response, fallback: string) {
  const data = await response.json<{ error?: string }>().catch(() => ({}));
  return new ReferenceStorageError(data.error || fallback, response.status >= 400 && response.status < 600 ? response.status : 502);
}
