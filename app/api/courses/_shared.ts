import { ensureDb } from "../../../db";
import { chapters } from "../../course-data";
import { createId } from "../_lib";
import { evaluateRubric, type RubricRule, type ScratchProjectSummary } from "../../scratch-project";

export type CourseLessonInput = {
  id: string;
  title: string;
  objective: string;
  description: string;
  badgeName: string;
  sortOrder: number;
  questions: Array<{
    id: string;
    title: string;
    prompt: string;
    difficulty: string;
    estimatedMinutes: number;
    sortOrder: number;
    required: boolean;
    referenceAssetId?: string | null;
    analysis?: ScratchProjectSummary | null;
    rules: RubricRule[];
  }>;
};

export async function loadCourse(courseId: string, publishedOnly = false, requestedVersionId = "") {
  const db = await ensureDb();
  const course = await db.prepare(
    `SELECT c.*, t.name AS owner_name, t.email AS owner_email,
      ${requestedVersionId ? "?" : publishedOnly ? "c.current_version_id" : "(SELECT id FROM course_versions WHERE course_id = c.id ORDER BY version_no DESC LIMIT 1)"} AS selected_version_id
     FROM courses c JOIN teachers t ON t.id = c.owner_teacher_id WHERE c.id = ? ${publishedOnly ? "AND c.status = 'published'" : ""}`
  ).bind(...(requestedVersionId ? [requestedVersionId, courseId] : [courseId])).first<Record<string, unknown>>();
  if (!course) return null;
  const versionId = String(course.selected_version_id ?? "");
  const version = await db.prepare("SELECT * FROM course_versions WHERE id = ?").bind(versionId).first<Record<string, unknown>>();
  if (!version) return null;
  const lessonRows = await db.prepare("SELECT * FROM lessons WHERE course_version_id = ? ORDER BY sort_order, id").bind(versionId).all<Record<string, unknown>>();
  const lessons = [];
  for (const lesson of lessonRows.results ?? []) {
    const questionRows = await db.prepare(
      `SELECT q.*, f.file_name AS reference_file_name, f.file_size AS reference_file_size
       FROM questions q LEFT JOIN file_assets f ON f.id = q.reference_asset_id
       WHERE q.lesson_id = ? ORDER BY q.sort_order, q.id`
    ).bind(lesson.id).all<Record<string, unknown>>();
    const questions = [];
    for (const question of questionRows.results ?? []) {
      const ruleRows = await db.prepare("SELECT * FROM rubric_rules WHERE question_id = ? ORDER BY sort_order, id")
        .bind(question.id).all<Record<string, unknown>>();
      questions.push({ ...camelQuestion(question), rules: (ruleRows.results ?? []).map(camelRule) });
    }
    lessons.push({ ...camelLesson(lesson), questions });
  }
  return { ...camelCourse(course), version: camelVersion(version), lessons };
}

export async function validateDraft(courseId: string, teacherId: string) {
  const course = await loadCourse(courseId);
  if (!course || course.ownerTeacherId !== teacherId) return { ok: false, error: "找不到可送審的課程。" };
  if (course.version.status !== "draft" && course.version.status !== "changes_requested") return { ok: false, error: "只有草稿或退回修改的版本可以送審。" };
  if (!course.title.trim() || !course.summary.trim()) return { ok: false, error: "請填寫課程名稱與摘要。" };
  if (!course.version.previewConfirmed) return { ok: false, error: "請先完成學生預覽確認。" };
  if (course.lessons.length === 0) return { ok: false, error: "課程至少需要一堂課。" };
  for (const lesson of course.lessons) {
    if (lesson.questions.length === 0) return { ok: false, error: `「${lesson.title}」至少需要一題。` };
    for (const question of lesson.questions) {
      if (!question.referenceAssetId) return { ok: false, error: `「${question.title}」尚未上傳參考作品。` };
      if (question.rules.length === 0) return { ok: false, error: `「${question.title}」至少需要一項檢核規則。` };
      if (question.rules.reduce((sum: number, rule: RubricRule) => sum + rule.weight, 0) !== 100) return { ok: false, error: `「${question.title}」的檢核配分必須合計 100。` };
      const summary = question.analysis as ScratchProjectSummary | null;
      if (!summary?.valid) return { ok: false, error: `「${question.title}」缺少有效的作品分析。` };
      const evaluation = evaluateRubric(summary, question.rules);
      if (!evaluation.passed) return { ok: false, error: `「${question.title}」的參考作品未通過必要規則。` };
    }
  }
  return { ok: true, course };
}

export async function ensureOfficialSeedCourse() {
  const db = await ensureDb();
  const existing = await db.prepare("SELECT id FROM courses WHERE id = 'course_official_yilan_12'").first();
  if (existing) return;
  const owner = await db.prepare("SELECT id FROM teachers WHERE role = 'superadmin' ORDER BY created_at LIMIT 1").first<{ id: string }>();
  if (!owner) return;
  const versionId = "course_version_official_yilan_12_v1";
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO courses
      (id, owner_teacher_id, title, summary, school_year, region, education_stage, tags_json, status, current_version_id)
      VALUES ('course_official_yilan_12', ?, '宜蘭縣 Scratch 12 堂課', '從 Scratch 基本操作到射擊遊戲完成的十二堂漸進式課程。', '114', '宜蘭縣', '國小高年級至國中', '["Scratch","程式設計","官方課程"]', 'published', ?)`)
      .bind(owner.id, versionId),
    db.prepare(`INSERT OR IGNORE INTO course_versions
      (id, course_id, version_no, status, changelog, preview_confirmed, published_at)
      VALUES (?, 'course_official_yilan_12', 1, 'published', '由既有十二堂課轉入', 1, CURRENT_TIMESTAMP)`).bind(versionId),
  ];
  chapters.forEach((chapter, chapterIndex) => {
    const lessonId = `official_lesson_${chapter.no}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO lessons
      (id, course_version_id, title, objective, description, badge_name, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(lessonId, versionId, chapter.title, chapter.objective, chapter.overview, chapter.badge, chapterIndex));
    const tasks = chapter.submissionTasks?.length ? chapter.submissionTasks : [{ id: "default", title: chapter.title, description: chapter.objective, checkIds: chapter.checks.map((item) => item.id) }];
    tasks.forEach((task, taskIndex) => {
      const questionId = `official_question_${chapter.no}_${task.id}`;
      statements.push(db.prepare(`INSERT OR IGNORE INTO questions
        (id, lesson_id, title, prompt, difficulty, estimated_minutes, sort_order, required, analysis_json)
        VALUES (?, ?, ?, ?, 'beginner', 30, ?, 1, '{"legacy":true}')`)
        .bind(questionId, lessonId, task.title, task.description, taskIndex));
      const checks = chapter.checks.filter((check) => task.checkIds.includes(check.id));
      const base = Math.floor(100 / Math.max(checks.length, 1));
      let remainder = 100 - base * checks.length;
      checks.forEach((check, checkIndex) => {
        statements.push(db.prepare(`INSERT OR IGNORE INTO rubric_rules
          (id, question_id, label, mode, scope, type, config_json, required, weight, pass_feedback, fail_feedback, sort_order)
          VALUES (?, ?, ?, 'hybrid', 'project', 'manual_review', ?, 1, ?, '已完成此項功能。', '請依提示修正作品。', ?)`)
          .bind(`official_rule_${chapter.no}_${check.id}`, questionId, check.label, JSON.stringify({ legacyCheckId: check.id, chapterNo: chapter.no, task: task.id }), base + (remainder-- > 0 ? 1 : 0), checkIndex));
      });
    });
  });
  await db.batch(statements);
  await db.prepare(`INSERT OR IGNORE INTO class_courses (id, class_id, course_version_id, sort_order, status, assignment_enabled)
    SELECT 'official_adoption_' || id, id, ?, 0, 'active', 1 FROM classes`).bind(versionId).run();
}

function camelCourse(row: Record<string, unknown>) {
  return { id: String(row.id), ownerTeacherId: String(row.owner_teacher_id), ownerName: String(row.owner_name ?? ""), title: String(row.title), summary: String(row.summary), schoolYear: String(row.school_year ?? ""), region: String(row.region ?? ""), educationStage: String(row.education_stage ?? ""), tags: safeJson<string[]>(row.tags_json, []), status: String(row.status), currentVersionId: row.current_version_id ? String(row.current_version_id) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
function camelVersion(row: Record<string, unknown>) {
  return { id: String(row.id), courseId: String(row.course_id), versionNo: Number(row.version_no), status: String(row.status), changelog: String(row.changelog ?? ""), previewConfirmed: Boolean(row.preview_confirmed), publishedAt: row.published_at ? String(row.published_at) : null, createdAt: String(row.created_at) };
}
function camelLesson(row: Record<string, unknown>) {
  return { id: String(row.id), title: String(row.title), objective: String(row.objective ?? ""), description: String(row.description ?? ""), badgeName: String(row.badge_name ?? ""), sortOrder: Number(row.sort_order) };
}
function camelQuestion(row: Record<string, unknown>) {
  return { id: String(row.id), title: String(row.title), prompt: String(row.prompt ?? ""), difficulty: String(row.difficulty), estimatedMinutes: Number(row.estimated_minutes), sortOrder: Number(row.sort_order), required: Boolean(row.required), referenceAssetId: row.reference_asset_id ? String(row.reference_asset_id) : null, referenceFileName: row.reference_file_name ? String(row.reference_file_name) : null, referenceFileSize: row.reference_file_size ? Number(row.reference_file_size) : null, analysis: safeJson<ScratchProjectSummary | null>(row.analysis_json, null) };
}
function camelRule(row: Record<string, unknown>): RubricRule {
  return { id: String(row.id), label: String(row.label), mode: row.mode as RubricRule["mode"], scope: row.scope as RubricRule["scope"], type: row.type as RubricRule["type"], config: safeJson(row.config_json, {}), required: Boolean(row.required), weight: Number(row.weight), passFeedback: String(row.pass_feedback), failFeedback: String(row.fail_feedback) };
}
function safeJson<T>(value: unknown, fallback: T): T {
  try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export function freshId(prefix: string) { return createId(prefix); }
