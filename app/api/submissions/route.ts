import { ensureDb } from "../../../db";
import {
  cleanText,
  createId,
  getChapter,
  getStudentProgress,
  jsonError,
  scoreChecklist,
} from "../_lib";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    studentId?: string;
    chapterNo?: number;
    checklist?: string[];
    fileName?: string;
    fileSize?: number;
  } | null;

  const studentId = cleanText(payload?.studentId, 80);
  const chapterNo = Number(payload?.chapterNo);
  const fileName = cleanText(payload?.fileName, 180);
  const fileSize = Number(payload?.fileSize);

  if (!studentId || !Number.isInteger(chapterNo)) {
    return jsonError("缺少學生或章節資料。");
  }
  const chapter = getChapter(chapterNo);
  if (!chapter) return jsonError("找不到章節。");
  if (!fileName.toLowerCase().endsWith(".sb3")) {
    return jsonError("請選擇 Scratch .sb3 檔案。");
  }
  const expectedFileCount = chapter.submissionTasks?.length ?? 1;
  const maxSubmissionSize = MAX_FILE_SIZE * expectedFileCount;
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxSubmissionSize) {
    return jsonError(expectedFileCount > 1 ? "每個檔案都需小於 20MB。" : "檔案需小於 20MB。");
  }

  const checkedIds = Array.isArray(payload?.checklist)
    ? payload.checklist.filter((item): item is string => typeof item === "string")
    : [];
  const db = await ensureDb();
  const student = await db
    .prepare(
      `SELECT st.id, c.submission_url
       FROM students st
       JOIN classes c ON c.id = st.class_id
       JOIN teachers t ON t.id = c.teacher_id
       WHERE st.id = ? AND c.status = 'active' AND t.status = 'active'`
    )
    .bind(studentId)
    .first<{ id: string; submission_url: string }>();

  if (!student) return jsonError("找不到學生。", 404);

  const result = scoreChecklist(chapterNo, checkedIds);
  const usesExternalSubmission = Boolean(student.submission_url);
  const status = result.passed
    ? usesExternalSubmission
      ? "ready_to_upload"
      : "passed"
    : "needs_fix";
  const externalStatus = result.passed && usesExternalSubmission ? "waiting_student" : "not_required";
  const submissionId = createId("sub");

  await db
    .prepare(
      `INSERT INTO submissions (
        id, student_id, chapter_no, file_name, file_key, file_size,
        checklist_json, auto_score, status, external_status, feedback, updated_at
      ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, chapter_no) DO UPDATE SET
        id = excluded.id,
        file_name = excluded.file_name,
        file_key = '',
        file_size = excluded.file_size,
        checklist_json = excluded.checklist_json,
        auto_score = excluded.auto_score,
        status = excluded.status,
        external_status = excluded.external_status,
        feedback = excluded.feedback,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      submissionId,
      studentId,
      chapterNo,
      fileName,
      fileSize,
      JSON.stringify(checkedIds),
      result.score,
      status,
      externalStatus,
      result.passed
        ? usesExternalSubmission
          ? "自我檢核通過，請到老師指定的雲端空間繳交。"
          : "完成本章自我檢核。"
        : `尚缺 ${result.missing.length} 項檢核。`
    )
    .run();

  if (result.passed && !usesExternalSubmission) {
    await awardBadge(db, studentId, chapterNo, chapter.badge);
  } else {
    await db.prepare("DELETE FROM badges WHERE student_id = ? AND chapter_no = ?").bind(studentId, chapterNo).run();
  }

  return Response.json({
    submission: { id: submissionId, chapterNo, status, score: result.score, missing: result.missing },
    ...(await getStudentProgress(studentId)),
  });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    studentId?: string;
    teacherId?: string;
    submissionId?: string;
  } | null;
  const action = cleanText(payload?.action, 30);
  const studentId = cleanText(payload?.studentId, 80);
  const teacherId = cleanText(payload?.teacherId, 80);
  const submissionId = cleanText(payload?.submissionId, 80);
  const db = await ensureDb();

  if (action === "mark_uploaded") {
    const result = await db
      .prepare(
        `UPDATE submissions SET status = 'uploaded', external_status = 'reported',
          feedback = '學生已回報完成雲端繳交，等待老師確認。', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND student_id = ? AND status IN ('ready_to_upload', 'resubmit')
           AND EXISTS (
             SELECT 1 FROM students st JOIN classes c ON c.id = st.class_id JOIN teachers t ON t.id = c.teacher_id
             WHERE st.id = submissions.student_id AND c.status = 'active' AND t.status = 'active'
           )`
      )
      .bind(submissionId, studentId)
      .run();
    if (!result.meta.changes) return jsonError("找不到可回報的繳交紀錄。", 404);
    return Response.json(await getStudentProgress(studentId));
  }

  if (action !== "confirm" && action !== "resubmit") {
    return jsonError("不支援的繳交操作。");
  }

  const row = await db
    .prepare(
      `SELECT s.student_id, s.chapter_no, c.teacher_id
       FROM submissions s
       JOIN students st ON st.id = s.student_id
       JOIN classes c ON c.id = st.class_id
       WHERE s.id = ? AND c.status = 'active' AND c.teacher_id = ? AND EXISTS (
         SELECT 1 FROM teachers active_teacher WHERE active_teacher.id = c.teacher_id AND active_teacher.status = 'active'
       )`
    )
    .bind(submissionId, teacherId)
    .first<{ student_id: string; chapter_no: number; teacher_id: string }>();
  if (!row || row.teacher_id !== teacherId) return jsonError("找不到作品，或這不是你的班級。", 404);

  if (action === "confirm") {
    const chapter = getChapter(row.chapter_no);
    if (!chapter) return jsonError("找不到章節。");
    await db
      .prepare(
        `UPDATE submissions SET status = 'passed', external_status = 'confirmed',
          feedback = '老師已確認收到作品。', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .bind(submissionId)
      .run();
    await awardBadge(db, row.student_id, row.chapter_no, chapter.badge);
  } else {
    await db
      .prepare(
        `UPDATE submissions SET status = 'resubmit', external_status = 'waiting_student',
          feedback = '老師尚未找到作品，請重新繳交。', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .bind(submissionId)
      .run();
    await db.prepare("DELETE FROM badges WHERE student_id = ? AND chapter_no = ?").bind(row.student_id, row.chapter_no).run();
  }

  return Response.json({ ok: true });
}

async function awardBadge(db: D1Database, studentId: string, chapterNo: number, badgeName: string) {
  await db
    .prepare(
      `INSERT INTO badges (id, student_id, chapter_no, badge_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(student_id, chapter_no) DO UPDATE SET
         badge_name = excluded.badge_name, earned_at = CURRENT_TIMESTAMP`
    )
    .bind(createId("bdg"), studentId, chapterNo, badgeName)
    .run();
}
