import { ensureDb } from "../../../db";
import { requireTeacher } from "../auth";
import { cleanText, createId, jsonError } from "../_lib";
import { ensureOfficialSeedCourse, loadCourse, type CourseLessonInput, validateDraft } from "./_shared";

export async function GET(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  await ensureOfficialSeedCourse();
  const { searchParams } = new URL(request.url);
  const courseId = cleanText(searchParams.get("id"), 100);
  if (courseId) {
    const course = await loadCourse(courseId);
    if (!course || course.ownerTeacherId !== actor.teacher.id) return jsonError("找不到你的課程。", 404);
    return Response.json({ course });
  }
  const db = await ensureDb();
  const rows = await db.prepare(
    `SELECT c.*, cv.id AS version_id, cv.version_no, cv.status AS version_status, cv.preview_confirmed,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_version_id = cv.id) AS lesson_count
     FROM courses c JOIN course_versions cv ON cv.id = (
       SELECT id FROM course_versions WHERE course_id = c.id ORDER BY version_no DESC LIMIT 1
     ) WHERE c.owner_teacher_id = ? ORDER BY c.updated_at DESC`
  ).bind(actor.teacher.id).all();
  return Response.json({ courses: rows.results ?? [] });
}

export async function POST(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as { title?: string; summary?: string } | null;
  const title = cleanText(payload?.title, 120) || "未命名 Scratch 課程";
  const summary = cleanText(payload?.summary, 600);
  const courseId = createId("course");
  const versionId = createId("version");
  const db = await ensureDb();
  await db.batch([
    db.prepare(`INSERT INTO courses (id, owner_teacher_id, title, summary, status)
      VALUES (?, ?, ?, ?, 'draft')`).bind(courseId, actor.teacher.id, title, summary),
    db.prepare(`INSERT INTO course_versions (id, course_id, version_no, status)
      VALUES (?, ?, 1, 'draft')`).bind(versionId, courseId),
  ]);
  return Response.json({ course: await loadCourse(courseId) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await requireTeacher(request);
  if (actor instanceof Response) return actor;
  const payload = await request.json().catch(() => null) as {
    action?: string;
    courseId?: string;
    title?: string;
    summary?: string;
    schoolYear?: string;
    region?: string;
    educationStage?: string;
    tags?: string[];
    changelog?: string;
    previewConfirmed?: boolean;
    lessons?: CourseLessonInput[];
  } | null;
  const action = cleanText(payload?.action, 30);
  const courseId = cleanText(payload?.courseId, 100);
  const course = await loadCourse(courseId);
  if (!course || course.ownerTeacherId !== actor.teacher.id) return jsonError("找不到你的課程。", 404);
  const db = await ensureDb();

  if (action === "save") {
    if (course.version.status !== "draft" && course.version.status !== "changes_requested") return jsonError("已送審或發布的版本不能修改。", 409);
    const lessons = Array.isArray(payload?.lessons) ? payload.lessons.slice(0, 60) : [];
    const requestedAssetIds = new Set(
      lessons.flatMap((lesson) => (lesson.questions ?? []).map((question) => cleanText(question.referenceAssetId, 100)).filter(Boolean)),
    );
    if (requestedAssetIds.size > 0) {
      const ownedAssets = await db.prepare("SELECT id FROM file_assets WHERE owner_teacher_id = ?")
        .bind(actor.teacher.id).all<{ id: string }>();
      const ownedAssetIds = new Set((ownedAssets.results ?? []).map((asset) => asset.id));
      if ([...requestedAssetIds].some((assetId) => !ownedAssetIds.has(assetId))) {
        return jsonError("課程包含不屬於你的參考作品。", 403);
      }
    }
    const versionId = course.version.id;
    const statements: D1PreparedStatement[] = [
      db.prepare(`UPDATE courses SET title = ?, summary = ?, school_year = ?, region = ?, education_stage = ?, tags_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(cleanText(payload?.title, 120), cleanText(payload?.summary, 600), cleanText(payload?.schoolYear, 20), cleanText(payload?.region, 60), cleanText(payload?.educationStage, 60), JSON.stringify((payload?.tags ?? []).map((tag) => cleanText(tag, 30)).filter(Boolean).slice(0, 12)), courseId),
      db.prepare("UPDATE course_versions SET changelog = ?, preview_confirmed = ? WHERE id = ?")
        .bind(cleanText(payload?.changelog, 500), payload?.previewConfirmed ? 1 : 0, versionId),
      db.prepare("DELETE FROM rubric_rules WHERE question_id IN (SELECT q.id FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE l.course_version_id = ?)").bind(versionId),
      db.prepare("DELETE FROM questions WHERE lesson_id IN (SELECT id FROM lessons WHERE course_version_id = ?)").bind(versionId),
      db.prepare("DELETE FROM lessons WHERE course_version_id = ?").bind(versionId),
    ];
    lessons.forEach((lesson, lessonIndex) => {
      const lessonId = safeId(lesson.id, "lesson");
      statements.push(db.prepare(`INSERT INTO lessons (id, course_version_id, title, objective, description, badge_name, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(lessonId, versionId, cleanText(lesson.title, 120), cleanText(lesson.objective, 500), cleanText(lesson.description, 2000), cleanText(lesson.badgeName, 80), lessonIndex));
      (lesson.questions ?? []).slice(0, 30).forEach((question, questionIndex) => {
        const questionId = safeId(question.id, "question");
        statements.push(db.prepare(`INSERT INTO questions
          (id, lesson_id, title, prompt, difficulty, estimated_minutes, sort_order, required, reference_asset_id, analysis_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(questionId, lessonId, cleanText(question.title, 120), cleanText(question.prompt, 4000), allowedDifficulty(question.difficulty), clamp(question.estimatedMinutes, 1, 300), questionIndex, question.required === false ? 0 : 1, cleanText(question.referenceAssetId, 100) || null, JSON.stringify(question.analysis ?? {})));
        (question.rules ?? []).slice(0, 50).forEach((rule, ruleIndex) => {
          statements.push(db.prepare(`INSERT INTO rubric_rules
            (id, question_id, label, mode, scope, type, config_json, required, weight, pass_feedback, fail_feedback, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(safeId(rule.id, "rule"), questionId, cleanText(rule.label, 240), allowedMode(rule.mode), cleanText(rule.scope, 120) || "project", cleanText(rule.type, 60), JSON.stringify(rule.config ?? {}), rule.required ? 1 : 0, clamp(rule.weight, 0, 100), cleanText(rule.passFeedback, 500), cleanText(rule.failFeedback, 500), ruleIndex));
        });
      });
    });
    await db.batch(statements);
    return Response.json({ course: await loadCourse(courseId) });
  }

  if (action === "confirm_preview") {
    await db.prepare("UPDATE course_versions SET preview_confirmed = 1 WHERE id = ? AND status IN ('draft', 'changes_requested')").bind(course.version.id).run();
    return Response.json({ ok: true });
  }

  if (action === "submit") {
    const validation = await validateDraft(courseId, actor.teacher.id);
    if (!validation.ok) return jsonError(validation.error ?? "課程尚未符合送審條件。", 409);
    await db.batch([
      db.prepare("UPDATE course_versions SET status = 'submitted' WHERE id = ?").bind(course.version.id),
      db.prepare("UPDATE courses SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(courseId),
      db.prepare("INSERT INTO course_reviews (id, course_version_id, status, comment) VALUES (?, ?, 'submitted', '')").bind(createId("review"), course.version.id),
    ]);
    return Response.json({ ok: true });
  }

  if (action === "new_version") {
    if (course.version.status !== "published") return jsonError("只有已發布課程可以建立新版。", 409);
    const nextVersionId = createId("version");
    const nextNo = Number(course.version.versionNo) + 1;
    await db.prepare("INSERT INTO course_versions (id, course_id, version_no, status, changelog) VALUES (?, ?, ?, 'draft', ?)")
      .bind(nextVersionId, courseId, nextNo, cleanText(payload?.changelog, 500)).run();
    await cloneVersion(db, course.version.id, nextVersionId);
    await db.prepare("UPDATE courses SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(courseId).run();
    return Response.json({ course: await loadCourse(courseId) });
  }

  if (action === "archive") {
    await db.prepare("UPDATE courses SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(courseId).run();
    return Response.json({ ok: true });
  }
  return jsonError("不支援的課程操作。");
}

function safeId(value: unknown, prefix: string) {
  const id = cleanText(value, 100);
  return /^[a-zA-Z0-9_-]{8,100}$/.test(id) ? id : createId(prefix);
}
function clamp(value: unknown, minimum: number, maximum: number) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum;
}
function allowedDifficulty(value: unknown) { return ["beginner", "intermediate", "advanced"].includes(String(value)) ? String(value) : "beginner"; }
function allowedMode(value: unknown) { return ["automatic", "manual", "hybrid"].includes(String(value)) ? String(value) : "automatic"; }

async function cloneVersion(db: D1Database, sourceVersionId: string, targetVersionId: string) {
  const lessons = await db.prepare("SELECT * FROM lessons WHERE course_version_id = ? ORDER BY sort_order").bind(sourceVersionId).all<Record<string, unknown>>();
  for (const lesson of lessons.results ?? []) {
    const newLessonId = createId("lesson");
    await db.prepare(`INSERT INTO lessons (id, course_version_id, title, objective, description, badge_name, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(newLessonId, targetVersionId, lesson.title, lesson.objective, lesson.description, lesson.badge_name, lesson.sort_order).run();
    const questions = await db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY sort_order").bind(lesson.id).all<Record<string, unknown>>();
    for (const question of questions.results ?? []) {
      const newQuestionId = createId("question");
      await db.prepare(`INSERT INTO questions (id, lesson_id, title, prompt, difficulty, estimated_minutes, sort_order, required, reference_asset_id, analysis_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newQuestionId, newLessonId, question.title, question.prompt, question.difficulty, question.estimated_minutes, question.sort_order, question.required, question.reference_asset_id, question.analysis_json).run();
      await db.prepare(`INSERT INTO rubric_rules (id, question_id, label, mode, scope, type, config_json, required, weight, pass_feedback, fail_feedback, sort_order)
        SELECT 'rule_' || lower(hex(randomblob(9))), ?, label, mode, scope, type, config_json, required, weight, pass_feedback, fail_feedback, sort_order FROM rubric_rules WHERE question_id = ?`)
        .bind(newQuestionId, question.id).run();
    }
  }
}
