"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { authorizedFetch, firebaseAuth, signInWithGoogle } from "../firebase-client";
import { evaluateRubric, inspectScratchProject, suggestRubricRules, type RubricRule, type ScratchProjectSummary } from "../scratch-project";
import { CourseMapBackButton } from "../HardNavigationLink";

type QuestionDraft = { id: string; title: string; prompt: string; difficulty: string; estimatedMinutes: number; sortOrder: number; required: boolean; referenceAssetId?: string | null; referenceFileName?: string | null; analysis?: ScratchProjectSummary | null; rules: RubricRule[] };
type LessonDraft = { id: string; title: string; objective: string; description: string; badgeName: string; sortOrder: number; questions: QuestionDraft[] };
type CourseDraft = { id: string; title: string; summary: string; schoolYear: string; region: string; educationStage: string; tags: string[]; status: string; version: { id: string; versionNo: number; status: string; changelog: string; previewConfirmed: boolean }; lessons: LessonDraft[] };
type CourseListItem = { id: string; title: string; status: string; version_status: string; version_no: number; lesson_count: number };

async function json<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(value.error || "操作失敗。");
  return value as T;
}

function localId(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`; }
async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const MAX_COURSE_ARCHIVE_SIZE = 260 * 1024 * 1024;
const MAX_COURSE_EXPANDED_SIZE = 270 * 1024 * 1024;
const MAX_REFERENCE_SIZE = 20 * 1024 * 1024;
const MAX_JSON_SIZE = 5 * 1024 * 1024;

export function CourseStudio() {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [course, setCourse] = useState<CourseDraft | null>(null);
  const [message, setMessage] = useState("請使用已啟用的教師 Google 帳號登入。");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  async function loadCourses() {
    const data = await json<{ courses: CourseListItem[] }>(await authorizedFetch("/api/courses"));
    setCourses(data.courses);
    setSignedIn(true);
    setMessage(data.courses.length ? "選擇課程開始編輯。" : "尚未建立課程。");
  }
  async function loadCourse(id: string) {
    const data = await json<{ course: CourseDraft }>(await authorizedFetch(`/api/courses?id=${encodeURIComponent(id)}`));
    setCourse(data.course);
  }
  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => { if (user) void loadCourses().catch(() => setSignedIn(false)); }), []);

  async function login() {
    setBusy(true);
    try {
      const google = await signInWithGoogle();
      await json(await fetch("/api/teacher/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: google.idToken }) }));
      await loadCourses();
    } catch (error) { setMessage(error instanceof Error ? error.message : "登入失敗。"); }
    finally { setBusy(false); }
  }

  async function createCourse() {
    setBusy(true);
    try {
      const data = await json<{ course: CourseDraft }>(await authorizedFetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "未命名 Scratch 課程", summary: "" }) }));
      setCourse(data.course); await loadCourses(); setMessage("已建立課程草稿。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "建立失敗。"); }
    finally { setBusy(false); }
  }

  async function createOfficialTemplate() {
    setBusy(true);
    try {
      const data = await json<{ course: CourseDraft }>(await authorizedFetch("/api/courses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ template: "yilan_scratch_12" }),
      }));
      setCourse(data.course);
      await loadCourses();
      setMessage("已加入完整的 12 堂課程範本。14 支影片、原始參考作品、作品分析與檢核規則都已帶入，可直接預覽後送審。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法加入課程範本。"); }
    finally { setBusy(false); }
  }

  async function save(value = course, quiet = false) {
    if (!value) return null;
    const data = await json<{ course: CourseDraft }>(await authorizedFetch("/api/courses", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", courseId: value.id, title: value.title, summary: value.summary, schoolYear: value.schoolYear, region: value.region, educationStage: value.educationStage, tags: value.tags, changelog: value.version.changelog, previewConfirmed: value.version.previewConfirmed, lessons: value.lessons }),
    }));
    setCourse(data.course); if (!quiet) setMessage("草稿已儲存。"); return data.course;
  }

  async function uploadReference(lessonId: string, questionId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !course) return;
    setBusy(true);
    try {
      const analysis = await inspectScratchProject(file);
      const next = { ...course, version: { ...course.version, previewConfirmed: false }, lessons: course.lessons.map((lesson) => lesson.id !== lessonId ? lesson : ({ ...lesson, questions: lesson.questions.map((question) => question.id !== questionId ? question : ({ ...question, analysis, rules: [...suggestRubricRules(analysis), ...question.rules.filter((rule) => rule.type === "manual_review").map((rule) => ({ ...rule, mode: "manual" as const, weight: 0 }))], referenceFileName: file.name })) })) };
      setCourse(next);
      await save(next, true);
      await json(await authorizedFetch(`/api/course-files?questionId=${encodeURIComponent(questionId)}&fileName=${encodeURIComponent(file.name)}&sha256=${analysis.sha256}`, { method: "PUT", headers: { "content-type": "application/x.scratch.sb3", "content-length": String(file.size) }, body: file }));
      await loadCourse(course.id); setMessage(`已分析並保存 ${file.name}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "作品分析失敗。"); }
    finally { setBusy(false); event.target.value = ""; }
  }

  function addLesson() {
    if (!course) return;
    setCourse({ ...course, version: { ...course.version, previewConfirmed: false }, lessons: [...course.lessons, { id: localId("lesson"), title: `第 ${course.lessons.length + 1} 堂`, objective: "", description: "", badgeName: "", sortOrder: course.lessons.length, questions: [] }] });
  }
  function addQuestion(lessonId: string) {
    if (!course) return;
    setCourse({ ...course, version: { ...course.version, previewConfirmed: false }, lessons: course.lessons.map((lesson) => lesson.id !== lessonId ? lesson : ({ ...lesson, questions: [...lesson.questions, { id: localId("question"), title: `題目 ${lesson.questions.length + 1}`, prompt: "", difficulty: "beginner", estimatedMinutes: 20, sortOrder: lesson.questions.length, required: true, analysis: null, rules: [] }] })) });
  }
  function updateLesson(id: string, patch: Partial<LessonDraft>) { if (course) setCourse({ ...course, version: { ...course.version, previewConfirmed: false }, lessons: course.lessons.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function updateQuestion(lessonId: string, id: string, patch: Partial<QuestionDraft>) { if (course) setCourse({ ...course, version: { ...course.version, previewConfirmed: false }, lessons: course.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, questions: lesson.questions.map((item) => item.id === id ? { ...item, ...patch } : item) } : lesson) }); }
  function updateRule(lessonId: string, questionId: string, ruleId: string, patch: Partial<RubricRule>) {
    const lesson = course?.lessons.find((item) => item.id === lessonId); const question = lesson?.questions.find((item) => item.id === questionId);
    if (question) updateQuestion(lessonId, questionId, { rules: question.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule) });
  }
  function moveLesson(index: number, delta: number) { if (!course) return; const target = index + delta; if (target < 0 || target >= course.lessons.length) return; const lessons = [...course.lessons]; [lessons[index], lessons[target]] = [lessons[target], lessons[index]]; setCourse({ ...course, version: { ...course.version, previewConfirmed: false }, lessons }); }
  function moveQuestion(lessonId: string, index: number, delta: number) { const lesson = course?.lessons.find((item) => item.id === lessonId); if (!lesson) return; const target = index + delta; if (target < 0 || target >= lesson.questions.length) return; const questions = [...lesson.questions]; [questions[index], questions[target]] = [questions[target], questions[index]]; updateLesson(lessonId, { questions }); }
  function addManualRule(lessonId: string, questionId: string) { const question = course?.lessons.find((item) => item.id === lessonId)?.questions.find((item) => item.id === questionId); if (!question) return; updateQuestion(lessonId, questionId, { rules: [...question.rules, { id: localId("rule"), label: "教師人工檢核項目", mode: "manual", scope: "project", type: "manual_review", config: {}, required: false, weight: 0, passFeedback: "教師已確認。", failFeedback: "請依教師建議修正。" }] }); }

  function preview() {
    if (!course) return;
    const failures: string[] = [];
    course.lessons.forEach((lesson) => lesson.questions.forEach((question) => {
      if (!question.analysis) failures.push(`${lesson.title}／${question.title}：缺少參考作品`);
      else {
        const result = evaluateRubric(question.analysis, question.rules);
        if (!result.passed) failures.push(`${lesson.title}／${question.title}：必要規則未通過`);
      }
    }));
    if (failures.length) { setMessage(failures.join("；")); return; }
    setCourse({ ...course, version: { ...course.version, previewConfirmed: true } });
    setMessage("學生預覽檢核成功；請儲存後即可送審。");
  }

  async function submit() {
    if (!course) return; setBusy(true);
    try { const saved = await save(course, true); await json(await authorizedFetch("/api/courses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit", courseId: saved?.id }) })); await loadCourse(course.id); await loadCourses(); setMessage("課程已送交管理員審核。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "送審失敗。"); }
    finally { setBusy(false); }
  }

  async function newVersion() {
    if (!course) return; setBusy(true);
    try { const data = await json<{ course: CourseDraft }>(await authorizedFetch("/api/courses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "new_version", courseId: course.id, changelog: "新版內容調整" }) })); setCourse(data.course); await loadCourses(); setMessage("已從已發布版本建立新的私人草稿。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "無法建立新版。"); }
    finally { setBusy(false); }
  }

  async function exportCourse() {
    if (!course) return; setBusy(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      const references: Array<{ questionId: string; path: string; sha256: string }> = [];
      for (const lesson of course.lessons) for (const question of lesson.questions) if (question.referenceAssetId && question.analysis) {
        const path = `references/${question.id}.sb3`;
        const response = await authorizedFetch(`/api/course-files?assetId=${encodeURIComponent(question.referenceAssetId)}`);
        if (!response.ok) throw new Error("無法下載參考作品。");
        entries[path] = new Uint8Array(await response.arrayBuffer()); references.push({ questionId: question.id, path, sha256: question.analysis.sha256 });
      }
      const questionCount = course.lessons.reduce((total, lesson) => total + lesson.questions.length, 0);
      if (questionCount === 0 || references.length !== questionCount) throw new Error("匯出前每一題都必須包含參考作品。");
      entries["course.json"] = strToU8(JSON.stringify({ ...course, status: "draft", version: { ...course.version, id: "", status: "draft", previewConfirmed: false }, lessons: course.lessons.map((lesson) => ({ ...lesson, questions: lesson.questions.map((question) => ({ ...question, referenceAssetId: null })) })) }, null, 2));
      entries["rubrics.json"] = strToU8(JSON.stringify(course.lessons.flatMap((lesson) => lesson.questions.map((question) => ({ questionId: question.id, rules: question.rules }))), null, 2));
      const files: Record<string, string> = {};
      for (const [path, bytes] of Object.entries(entries)) files[path] = await sha256Bytes(bytes);
      entries["manifest.json"] = strToU8(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), files, references }, null, 2));
      const blob = new Blob([new Uint8Array(zipSync(entries, { level: 6 }))], { type: "application/zip" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${course.title.replace(/[\\/:*?"<>|]/g, "_")}.zip`; link.click(); URL.revokeObjectURL(url); setMessage("課程包已匯出。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "匯出失敗。"); }
    finally { setBusy(false); }
  }

  async function importCourse(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setBusy(true);
    try {
      if (file.size <= 0 || file.size > MAX_COURSE_ARCHIVE_SIZE) throw new Error("課程包必須小於 260 MB。");
      let expandedSize = 0;
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => {
        expandedSize += entry.originalSize;
        if (expandedSize > MAX_COURSE_EXPANDED_SIZE) throw new Error("課程包解壓縮後超過安全限制。");
        if (["manifest.json", "course.json", "rubrics.json"].includes(entry.name)) return entry.originalSize <= MAX_JSON_SIZE;
        return entry.name.startsWith("references/") && entry.name.endsWith(".sb3") && entry.originalSize <= MAX_REFERENCE_SIZE;
      } });
      if (!archive["manifest.json"] || !archive["course.json"] || !archive["rubrics.json"]) throw new Error("課程包缺少必要資訊檔。");
      const manifest = JSON.parse(strFromU8(archive["manifest.json"])) as { schemaVersion?: number; files?: Record<string, string>; references?: Array<{ questionId: string; path: string; sha256: string }> };
      const source = JSON.parse(strFromU8(archive["course.json"])) as CourseDraft;
      const rubricIndex = JSON.parse(strFromU8(archive["rubrics.json"])) as Array<{ questionId?: string; rules?: unknown[] }>;
      if (manifest.schemaVersion !== 1 || !manifest.files || !source.title || !Array.isArray(source.lessons) || !Array.isArray(rubricIndex)) throw new Error("不支援或不完整的課程包。");
      for (const [path, expectedHash] of Object.entries(manifest.files)) {
        const bytes = archive[path];
        if (!bytes || !/^[a-f0-9]{64}$/.test(expectedHash) || await sha256Bytes(bytes) !== expectedHash) throw new Error(`課程包檔案驗證失敗：${path}`);
      }
      const sourceQuestionIds = new Set(source.lessons.flatMap((lesson) => lesson.questions.map((question) => question.id)));
      const referenceList = manifest.references ?? [];
      if (sourceQuestionIds.size === 0 || referenceList.length !== sourceQuestionIds.size) throw new Error("每一題都必須包含一份參考作品。");
      if (new Set(referenceList.map((reference) => reference.questionId)).size !== referenceList.length || referenceList.some((reference) => !sourceQuestionIds.has(reference.questionId))) throw new Error("課程包的題目與參考作品關聯不正確。");
      if (rubricIndex.length !== sourceQuestionIds.size || rubricIndex.some((item) => !item.questionId || !sourceQuestionIds.has(item.questionId) || !Array.isArray(item.rules))) throw new Error("課程包的檢核規則關聯不正確。");
      const verifiedReferences = [] as Array<{ sourceQuestionId: string; file: File }>;
      let referenceBytes = 0;
      for (const reference of referenceList) {
        if (!reference.path.startsWith("references/") || !reference.path.endsWith(".sb3")) throw new Error("參考作品路徑不正確。");
        const bytes = archive[reference.path];
        if (!bytes || bytes.byteLength > MAX_REFERENCE_SIZE) throw new Error("課程包缺少參考作品或檔案過大。");
        referenceBytes += bytes.byteLength;
        if (referenceBytes > 250 * 1024 * 1024) throw new Error("參考作品總量不能超過 250 MB。");
        const scratchFile = new File([new Uint8Array(bytes)], reference.path.split("/").pop() || "reference.sb3");
        const analysis = await inspectScratchProject(scratchFile);
        if (analysis.sha256 !== reference.sha256 || manifest.files[reference.path] !== reference.sha256) throw new Error("參考作品雜湊驗證失敗。");
        verifiedReferences.push({ sourceQuestionId: reference.questionId, file: scratchFile });
      }
      const created = await json<{ course: CourseDraft }>(await authorizedFetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `${source.title}（匯入）`, summary: source.summary }) }));
      const questionMap = new Map<string, string>();
      const imported: CourseDraft = { ...created.course, title: `${source.title}（匯入）`, summary: source.summary, schoolYear: source.schoolYear, region: source.region, educationStage: source.educationStage, tags: source.tags, lessons: source.lessons.map((lesson, lessonIndex) => ({ ...lesson, id: localId("lesson"), sortOrder: lessonIndex, questions: lesson.questions.map((question, questionIndex) => { const id = localId("question"); questionMap.set(question.id, id); return { ...question, id, sortOrder: questionIndex, referenceAssetId: null }; }) })) };
      await save(imported, true);
      for (const reference of verifiedReferences) {
        const nextId = questionMap.get(reference.sourceQuestionId); if (!nextId) throw new Error("課程包缺少參考作品。");
        const analysis = await inspectScratchProject(reference.file);
        await json(await authorizedFetch(`/api/course-files?questionId=${encodeURIComponent(nextId)}&fileName=${encodeURIComponent(reference.file.name)}&sha256=${analysis.sha256}`, { method: "PUT", headers: { "content-type": "application/x.scratch.sb3", "content-length": String(reference.file.size) }, body: reference.file }));
      }
      await loadCourse(created.course.id); await loadCourses(); setMessage("課程包已匯入為新草稿。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "匯入失敗。"); }
    finally { setBusy(false); event.target.value = ""; }
  }

  const editable = course?.version.status === "draft" || course?.version.status === "changes_requested";
  const totals = useMemo(() => course?.lessons.flatMap((lesson) => lesson.questions.map((question) => ({ id: question.id, total: question.rules.reduce((sum, rule) => sum + rule.weight, 0) }))) ?? [], [course]);

  return <main className="studio-shell">
    <header className="studio-header"><div><CourseMapBackButton>← 回課程地圖</CourseMapBackButton><p className="eyebrow">Course Studio</p><h1>Scratch 課程設計室</h1><p>從參考作品產生可編輯、可重現的檢核規則。</p></div><div className="studio-header__actions">{!signedIn && <button onClick={login} disabled={busy}>教師 Google 登入</button>}<Link href="/library">公開課程庫</Link><label className="button-label">匯入課程 ZIP<input type="file" accept=".zip" onChange={importCourse} hidden /></label></div></header>
    <div className="studio-message">{message}</div>
    <div className="studio-layout">
      <aside className="studio-sidebar"><button onClick={createCourse} disabled={!signedIn || busy}>＋ 建立空白課程</button><button className="template-button" onClick={createOfficialTemplate} disabled={!signedIn || busy}>加入宜蘭 Scratch 12 堂範本</button>{courses.map((item) => <button className={course?.id === item.id ? "selected" : ""} key={item.id} onClick={() => void loadCourse(item.id)}><strong>{item.title}</strong><span>v{item.version_no} · {item.version_status} · {item.lesson_count} 堂</span></button>)}</aside>
      <section className="studio-workspace">{!course ? <div className="studio-empty"><h2>選擇或建立課程</h2><p>課程會先保存為私人草稿，完成預覽後才能送審。</p></div> : <>
        <div className="studio-toolbar"><div><span>版本 {course.version.versionNo}</span><strong>{course.version.status}</strong></div><button onClick={() => void save()} disabled={!editable || busy}>儲存草稿</button><button onClick={preview} disabled={!editable || busy}>學生預覽檢核</button><button onClick={exportCourse} disabled={busy}>匯出 ZIP</button>{course.version.status === "published" && <button onClick={newVersion} disabled={busy}>建立新版</button>}<button onClick={submit} disabled={!editable || !course.version.previewConfirmed || busy}>送交審核</button></div>
        <div className="studio-card form-stack"><label>課程名稱<input value={course.title} disabled={!editable} onChange={(event) => setCourse({ ...course, title: event.target.value, version: { ...course.version, previewConfirmed: false } })} /></label><label>課程摘要<textarea value={course.summary} disabled={!editable} onChange={(event) => setCourse({ ...course, summary: event.target.value, version: { ...course.version, previewConfirmed: false } })} /></label><div className="form-row"><label>學年度<input value={course.schoolYear} disabled={!editable} onChange={(event) => setCourse({ ...course, schoolYear: event.target.value })} /></label><label>地區<input value={course.region} disabled={!editable} onChange={(event) => setCourse({ ...course, region: event.target.value })} /></label><label>學習階段<input value={course.educationStage} disabled={!editable} onChange={(event) => setCourse({ ...course, educationStage: event.target.value })} /></label></div><label>標籤（逗號分隔）<input value={course.tags.join(", ")} disabled={!editable} onChange={(event) => setCourse({ ...course, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label><label>版本說明<input value={course.version.changelog} disabled={!editable} onChange={(event) => setCourse({ ...course, version: { ...course.version, changelog: event.target.value } })} /></label></div>
        <div className="studio-section-title"><h2>課堂與題目</h2>{editable && <button onClick={addLesson}>＋ 新增課堂</button>}</div>
        {course.lessons.map((lesson, lessonIndex) => <article className="studio-card lesson-editor" key={lesson.id}><div className="editor-heading"><b>第 {lessonIndex + 1} 堂</b>{editable && <div className="order-actions"><button onClick={() => moveLesson(lessonIndex, -1)} disabled={lessonIndex === 0}>↑</button><button onClick={() => moveLesson(lessonIndex, 1)} disabled={lessonIndex === course.lessons.length - 1}>↓</button><button className="danger" onClick={() => setCourse({ ...course, lessons: course.lessons.filter((item) => item.id !== lesson.id) })}>刪除課堂</button></div>}</div><div className="form-row"><label>名稱<input value={lesson.title} disabled={!editable} onChange={(event) => updateLesson(lesson.id, { title: event.target.value })} /></label><label>徽章<input value={lesson.badgeName} disabled={!editable} onChange={(event) => updateLesson(lesson.id, { badgeName: event.target.value })} /></label></div><label>學習目標<textarea value={lesson.objective} disabled={!editable} onChange={(event) => updateLesson(lesson.id, { objective: event.target.value })} /></label><label>課程說明<textarea value={lesson.description} disabled={!editable} onChange={(event) => updateLesson(lesson.id, { description: event.target.value })} /></label>
          {lesson.questions.map((question, questionIndex) => <section className="question-editor" key={question.id}><div className="editor-heading"><h3>題目 {questionIndex + 1}</h3>{editable && <div className="order-actions"><button onClick={() => moveQuestion(lesson.id, questionIndex, -1)} disabled={questionIndex === 0}>↑</button><button onClick={() => moveQuestion(lesson.id, questionIndex, 1)} disabled={questionIndex === lesson.questions.length - 1}>↓</button><button className="danger" onClick={() => updateLesson(lesson.id, { questions: lesson.questions.filter((item) => item.id !== question.id) })}>刪除題目</button></div>}</div><label>題目名稱<input value={question.title} disabled={!editable} onChange={(event) => updateQuestion(lesson.id, question.id, { title: event.target.value })} /></label><label>題目說明<textarea value={question.prompt} disabled={!editable} onChange={(event) => updateQuestion(lesson.id, question.id, { prompt: event.target.value })} /></label><div className="form-row"><label>難度<select value={question.difficulty} disabled={!editable} onChange={(event) => updateQuestion(lesson.id, question.id, { difficulty: event.target.value })}><option value="beginner">基礎</option><option value="intermediate">進階</option><option value="advanced">挑戰</option></select></label><label>預估分鐘<input type="number" min="1" max="300" value={question.estimatedMinutes} disabled={!editable} onChange={(event) => updateQuestion(lesson.id, question.id, { estimatedMinutes: Number(event.target.value) })} /></label></div><div className="reference-upload"><div><strong>{question.referenceFileName || "尚未上傳參考作品"}</strong>{question.analysis && <span>{question.analysis.spriteCount} 個角色 · {question.analysis.blockCount} 個積木 · SHA-256 {question.analysis.sha256.slice(0, 12)}…</span>}</div>{editable && <label className="button-label">分析並上傳 .sb3<input type="file" accept=".sb3" hidden onChange={(event) => void uploadReference(lesson.id, question.id, event)} /></label>}</div>
            <div className="rule-list"><div className="editor-heading"><h4>檢核規則</h4><div className="order-actions"><span className={totals.find((item) => item.id === question.id)?.total === 100 ? "total-ok" : "total-bad"}>合計 {totals.find((item) => item.id === question.id)?.total ?? 0} 分</span>{editable && <button onClick={() => addManualRule(lesson.id, question.id)}>＋ 人工檢核</button>}</div></div>{question.rules.map((rule) => <div className="rule-row" key={rule.id}><input value={rule.label} disabled={!editable} onChange={(event) => updateRule(lesson.id, question.id, rule.id, { label: event.target.value })} /><select value={rule.mode} disabled={!editable} onChange={(event) => updateRule(lesson.id, question.id, rule.id, { mode: event.target.value as RubricRule["mode"] })}><option value="automatic">自動</option><option value="hybrid">混合</option><option value="manual">人工</option></select><input aria-label="配分" type="number" min="0" max="100" value={rule.weight} disabled={!editable} onChange={(event) => updateRule(lesson.id, question.id, rule.id, { weight: Number(event.target.value) })} /><label><input type="checkbox" checked={rule.required} disabled={!editable} onChange={(event) => updateRule(lesson.id, question.id, rule.id, { required: event.target.checked })} />必要</label>{editable && <button className="danger" onClick={() => updateQuestion(lesson.id, question.id, { rules: question.rules.filter((item) => item.id !== rule.id) })}>刪除</button>}</div>)}</div>
          </section>)}{editable && <button onClick={() => addQuestion(lesson.id)}>＋ 新增題目</button>}</article>)}
      </>}</section>
    </div>
  </main>;
}
