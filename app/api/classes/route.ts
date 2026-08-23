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
    .prepare("SELECT id, status FROM teachers WHERE id = ?")
    .bind(teacherId)
    .first<{ id: string; status: string }>();

  if (!teacher) {
    return jsonError("找不到老師帳號。", 404);
  }
  if (teacher.status !== "active") {
    return jsonError("老師帳號尚未啟用，請等待超級管理者審核。", 403);
  }

  const classId = createId("cls");
  const code = await generateClassCode();
  await db
    .prepare(
      "INSERT INTO classes (id, teacher_id, name, code, status) VALUES (?, ?, ?, ?, 'pending')"
    )
    .bind(classId, teacherId, name, code)
    .run();

  const classRow = await db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .bind(classId)
    .first();

  return Response.json({ class: publicClass(classRow as never) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    teacherId?: string;
    classId?: string;
    submissionUrl?: string;
    submissionLabel?: string;
  } | null;

  const teacherId = cleanText(payload?.teacherId, 80);
  const classId = cleanText(payload?.classId, 80);
  const submissionUrl = cleanText(payload?.submissionUrl, 500);
  const submissionLabel = cleanText(payload?.submissionLabel, 40) || "作品繳交連結";

  if (!teacherId || !classId) {
    return jsonError("缺少老師或班級資料。");
  }

  if (submissionUrl) {
    try {
      const parsed = new URL(submissionUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return jsonError("請輸入完整的雲端繳交網址。");
    }
  }

  const db = await ensureDb();
  const result = await db
    .prepare(
      `UPDATE classes
       SET submission_url = ?, submission_label = ?
       WHERE id = ? AND teacher_id = ? AND status = 'active'
         AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND status = 'active')`
    )
    .bind(submissionUrl, submissionLabel, classId, teacherId, teacherId)
    .run();

  if (!result.meta.changes) {
    return jsonError("找不到班級，或這不是你的班級。", 404);
  }

  const classRow = await db.prepare("SELECT * FROM classes WHERE id = ?").bind(classId).first();
  return Response.json({ class: publicClass(classRow as never) });
}
