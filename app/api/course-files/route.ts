import { ensureDb } from "../../../db";
import { requireActor, requireTeacher } from "../auth";
import { cleanText, createId, jsonError } from "../_lib";
import { deleteReferenceFile, downloadReferenceFile, ReferenceStorageError, uploadReferenceFile } from "../reference-storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_VERSION_SIZE = 250 * 1024 * 1024;

export async function PUT(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const questionId = cleanText(url.searchParams.get("questionId"), 100);
  const fileName = cleanText(url.searchParams.get("fileName"), 180);
  const sha256 = cleanText(url.searchParams.get("sha256"), 64).toLowerCase();
  const contentLength = Number(request.headers.get("content-length"));
  if (!questionId || !fileName.toLowerCase().endsWith(".sb3") || !/^[a-f0-9]{64}$/.test(sha256)) return jsonError("檔案資訊不完整。");
  if (!request.body || !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_FILE_SIZE) return jsonError("Scratch 檔案必須小於 20 MB。", 413);

  const db = await ensureDb();
  const question = await db.prepare(
    `SELECT q.id, q.reference_asset_id, cv.id AS version_id, cv.status, c.owner_teacher_id
     FROM questions q JOIN lessons l ON l.id = q.lesson_id
     JOIN course_versions cv ON cv.id = l.course_version_id JOIN courses c ON c.id = cv.course_id
     WHERE q.id = ?`
  ).bind(questionId).first<{ id: string; reference_asset_id: string | null; version_id: string; status: string; owner_teacher_id: string }>();
  if (!question || question.owner_teacher_id !== actor.teacher.id) return jsonError("找不到可上傳的題目。", 404);
  if (question.status !== "draft" && question.status !== "changes_requested") return jsonError("此版本已鎖定，不能更換參考作品。", 409);

  const usage = await db.prepare(
    `SELECT COALESCE(SUM(f.file_size), 0) AS total FROM questions q
     JOIN lessons l ON l.id = q.lesson_id LEFT JOIN file_assets f ON f.id = q.reference_asset_id
     WHERE l.course_version_id = ? AND q.id <> ?`
  ).bind(question.version_id, questionId).first<{ total: number }>();
  if (Number(usage?.total ?? 0) + contentLength > MAX_VERSION_SIZE) return jsonError("單一課程版本的參考作品總量不能超過 250 MB。", 413);

  const existing = await db.prepare("SELECT id, file_name, file_size, storage_provider FROM file_assets WHERE owner_teacher_id = ? AND sha256 = ?")
    .bind(actor.teacher.id, sha256).first<{ id: string; file_name: string; file_size: number; storage_provider: string }>();
  if (existing?.storage_provider === "cloudflare_kv") {
    await db.prepare("UPDATE questions SET reference_asset_id = ? WHERE id = ?").bind(existing.id, questionId).run();
    return Response.json({ asset: { id: existing.id, fileName: existing.file_name, fileSize: existing.file_size, sha256 }, deduplicated: true });
  }

  const assetId = existing?.id ?? createId("asset");
  const storageKey = `reference/${assetId}.sb3`;
  try {
    await uploadReferenceFile(storageKey, request.body, {
      fileName,
      contentType: "application/x.scratch.sb3",
      fileSize: contentLength,
      sha256,
    });
  } catch (error) {
    if (error instanceof ReferenceStorageError) return jsonError(error.message, error.status);
    return jsonError("無法將參考作品寫入 Cloudflare KV。", 502);
  }
  try {
    if (existing) {
      await db.batch([
        db.prepare(`UPDATE file_assets SET r2_key = ?, storage_provider = 'cloudflare_kv', provider_file_id = ?,
          file_name = ?, file_size = ?, content_type = 'application/x.scratch.sb3' WHERE id = ?`)
          .bind(storageKey, storageKey, fileName, contentLength, assetId),
        db.prepare("UPDATE questions SET reference_asset_id = ? WHERE id = ?").bind(assetId, questionId),
      ]);
    } else {
      await db.batch([
        db.prepare(`INSERT INTO file_assets
          (id, owner_teacher_id, r2_key, storage_provider, provider_file_id, sha256, file_name, file_size, purpose)
          VALUES (?, ?, ?, 'cloudflare_kv', ?, ?, ?, ?, 'reference')`)
          .bind(assetId, actor.teacher.id, storageKey, storageKey, sha256, fileName, contentLength),
        db.prepare("UPDATE questions SET reference_asset_id = ? WHERE id = ?").bind(assetId, questionId),
      ]);
    }
  } catch (error) {
    await deleteReferenceFile(storageKey).catch(() => undefined);
    throw error;
  }
  return Response.json({ asset: { id: assetId, fileName, fileSize: contentLength, sha256 } }, { status: 201 });
}

export async function GET(request: Request) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  const assetId = cleanText(new URL(request.url).searchParams.get("assetId"), 100);
  const db = await ensureDb();
  const asset = await db.prepare(
    `SELECT f.*, c.owner_teacher_id,
      EXISTS(
        SELECT 1 FROM questions q2 JOIN lessons l2 ON l2.id = q2.lesson_id
        JOIN class_courses cc ON cc.course_version_id = l2.course_version_id
        JOIN classes cl ON cl.id = cc.class_id
        WHERE q2.reference_asset_id = f.id AND cl.teacher_id = ? AND cc.status = 'active'
      ) AS adopted
     FROM file_assets f LEFT JOIN questions q ON q.reference_asset_id = f.id
     LEFT JOIN lessons l ON l.id = q.lesson_id LEFT JOIN course_versions cv ON cv.id = l.course_version_id
     LEFT JOIN courses c ON c.id = cv.course_id WHERE f.id = ? LIMIT 1`
  ).bind(actor.teacher?.id ?? "", assetId).first<{ r2_key: string; provider_file_id: string | null; storage_provider: string; file_name: string; file_size: number; content_type: string; owner_teacher_id: string; adopted: number }>();
  const isAdmin = actor.teacher?.role === "superadmin" && actor.teacher.status === "active";
  const allowed = Boolean(asset && actor.teacher && (asset.owner_teacher_id === actor.teacher.id || asset.adopted || isAdmin));
  if (!allowed || !asset) return jsonError("你沒有下載這份參考作品的權限。", 403);
  if (asset.storage_provider !== "cloudflare_kv") return jsonError("這份舊參考作品需要由原作者重新上傳。", 409);
  let object: Awaited<ReturnType<typeof downloadReferenceFile>>;
  try {
    object = await downloadReferenceFile(asset.provider_file_id || asset.r2_key);
  } catch (error) {
    if (error instanceof ReferenceStorageError) return jsonError(error.message, error.status);
    return jsonError("無法從 Cloudflare KV 讀取參考作品。", 502);
  }
  return new Response(object.body, {
    headers: {
      "content-type": asset.content_type,
      "content-length": String(asset.file_size),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.file_name)}`,
      "cache-control": "private, no-store",
    },
  });
}
