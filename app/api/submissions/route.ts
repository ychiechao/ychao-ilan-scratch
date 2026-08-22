import { getSubmissionsBucket } from "../../../db";
import {
  cleanText,
  createId,
  getChapter,
  getStudentProgress,
  jsonError,
  scoreChecklist,
} from "../_lib";
import { ensureDb } from "../../../db";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);

  if (!form) {
    return jsonError("無法讀取上傳內容。");
  }

  const studentId = cleanText(form.get("studentId"), 80);
  const chapterNo = Number(form.get("chapterNo"));
  const file = form.get("file");
  const rawChecklist = cleanText(form.get("checklist"), 2000);

  if (!studentId || !Number.isInteger(chapterNo)) {
    return jsonError("缺少學生或章節資料。");
  }

  if (!(file instanceof File)) {
    return jsonError("請上傳 Scratch .sb3 檔案。");
  }

  if (!file.name.toLowerCase().endsWith(".sb3")) {
    return jsonError("檔案格式需要是 .sb3。");
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return jsonError("檔案需小於 20MB。");
  }

  const chapter = getChapter(chapterNo);
  if (!chapter) {
    return jsonError("找不到章節。");
  }

  let checkedIds: string[] = [];
  try {
    const parsed = JSON.parse(rawChecklist || "[]");
    checkedIds = Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return jsonError("檢核清單格式錯誤。");
  }

  const db = await ensureDb();
  const student = await db
    .prepare("SELECT id FROM students WHERE id = ?")
    .bind(studentId)
    .first();

  if (!student) {
    return jsonError("找不到學生。", 404);
  }

  const result = scoreChecklist(chapterNo, checkedIds);
  const status = result.passed ? "passed" : "needs_fix";
  const submissionId = createId("sub");
  const fileKey = `submissions/${studentId}/chapter-${chapterNo}/${Date.now()}-${file.name}`;
  const bucket = getSubmissionsBucket();

  await bucket.put(fileKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: {
      studentId,
      chapterNo: String(chapterNo),
      originalName: file.name,
    },
  });

  await db
    .prepare(
      `INSERT INTO submissions (
        id, student_id, chapter_no, file_name, file_key, file_size,
        checklist_json, auto_score, status, feedback, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, chapter_no) DO UPDATE SET
        id = excluded.id,
        file_name = excluded.file_name,
        file_key = excluded.file_key,
        file_size = excluded.file_size,
        checklist_json = excluded.checklist_json,
        auto_score = excluded.auto_score,
        status = excluded.status,
        feedback = excluded.feedback,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      submissionId,
      studentId,
      chapterNo,
      file.name,
      fileKey,
      file.size,
      JSON.stringify(checkedIds),
      result.score,
      status,
      result.passed ? "完成本章自我檢核。" : `尚缺 ${result.missing.length} 項檢核。`
    )
    .run();

  if (result.passed) {
    await db
      .prepare(
        `INSERT INTO badges (id, student_id, chapter_no, badge_name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(student_id, chapter_no) DO UPDATE SET
           badge_name = excluded.badge_name,
           earned_at = CURRENT_TIMESTAMP`
      )
      .bind(createId("bdg"), studentId, chapterNo, chapter.badge)
      .run();
  }

  const progress = await getStudentProgress(studentId);

  return Response.json({
    submission: {
      id: submissionId,
      chapterNo,
      status,
      score: result.score,
      missing: result.missing,
      badge: result.passed ? chapter.badge : null,
    },
    ...progress,
  });
}
