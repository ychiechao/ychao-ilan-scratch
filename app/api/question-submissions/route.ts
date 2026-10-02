import { ensureDb } from "../../../db";
import { requireStudent } from "../auth";
import { cleanText, createId, jsonError } from "../_lib";
import { evaluateRubric, type RubricRule, type ScratchProjectSummary } from "../../scratch-project";

export async function POST(request: Request) {
  const actor = await requireStudent(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as { questionId?: string; fileName?: string; fileSize?: number; analysis?: ScratchProjectSummary } | null;
  const questionId = cleanText(payload?.questionId, 100);
  const fileName = cleanText(payload?.fileName, 180);
  const fileSize = Number(payload?.fileSize);
  if (!questionId || !fileName.toLowerCase().endsWith(".sb3") || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 20 * 1024 * 1024 || !payload?.analysis?.valid) return jsonError("作品分析資料不完整。");
  const db = await ensureDb();
  const question = await db.prepare(
    `SELECT q.id FROM questions q JOIN lessons l ON l.id = q.lesson_id
     JOIN class_courses cc ON cc.course_version_id = l.course_version_id
     WHERE q.id = ? AND cc.class_id = ? AND cc.status = 'active'`
  ).bind(questionId, actor.student.classId).first();
  if (!question) return jsonError("這題未指派給你的班級。", 403);
  const rows = await db.prepare("SELECT * FROM rubric_rules WHERE question_id = ? ORDER BY sort_order").bind(questionId).all<Record<string, unknown>>();
  const rules: RubricRule[] = (rows.results ?? []).map((row) => ({ id: String(row.id), label: String(row.label), mode: row.mode as RubricRule["mode"], scope: row.scope as RubricRule["scope"], type: row.type as RubricRule["type"], config: JSON.parse(String(row.config_json || "{}")), required: Boolean(row.required), weight: Number(row.weight), passFeedback: String(row.pass_feedback), failFeedback: String(row.fail_feedback) }));
  const evaluation = evaluateRubric(payload.analysis, rules);
  const status = evaluation.passed ? "passed" : "needs_fix";
  await db.prepare(`INSERT INTO question_results
    (id, student_id, question_id, file_name, file_size, analysis_json, results_json, score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, question_id) DO UPDATE SET file_name = excluded.file_name, file_size = excluded.file_size,
      analysis_json = excluded.analysis_json, results_json = excluded.results_json, score = excluded.score,
      status = excluded.status, updated_at = CURRENT_TIMESTAMP`)
    .bind(createId("result"), actor.student.id, questionId, fileName, fileSize, JSON.stringify(payload.analysis), JSON.stringify(evaluation.results), evaluation.score, status).run();
  await db.prepare("INSERT INTO user_activity_logs (id, user_type, user_id, action, detail_json) VALUES (?, 'student', ?, 'question_attempt', ?)")
    .bind(createId("activity"), actor.student.id, JSON.stringify({ questionId, score: evaluation.score, status })).run();
  return Response.json({ evaluation: { ...evaluation, status } });
}
