"use client";

import { FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { authorizedFetch, firebaseAuth, signInWithGoogle } from "../firebase-client";

type LibraryCourse = {
  id: string; title: string; summary: string; school_year: string; region: string;
  education_stage: string; tags_json: string; current_version_id: string;
  owner_name: string; version_no: number; lesson_count: number; question_count: number;
};
type ClassInfo = { id: string; name: string; code: string };
type Adoption = {
  id: string; class_id: string; class_name: string; course_id: string;
  adopted_version_no: number; latest_version_no: number; sort_order: number; status: string;
};
type Detail = {
  id: string; title: string; summary: string; ownerName: string; schoolYear: string;
  region: string; educationStage: string; tags: string[]; version: { id: string; versionNo: number };
  lessons: Array<{
    id: string; title: string; objective: string; description: string;
    questions: Array<{
      id: string; title: string; prompt: string; difficulty: string; estimatedMinutes: number;
      rules: Array<{ id: string; label: string; mode: string; weight: number }>;
    }>;
  }>;
};

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失敗。");
  return data as T;
}

export function CourseLibrary() {
  const [courses, setCourses] = useState<LibraryCourse[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [adoptions, setAdoptions] = useState<Adoption[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("請先使用 Google 帳號登入瀏覽課程。");
  const [canAdopt, setCanAdopt] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  async function load(q = "") {
    const data = await json<{ courses: LibraryCourse[]; classes: ClassInfo[]; adoptions: Adoption[]; canAdopt: boolean }>(
      await authorizedFetch(`/api/library?q=${encodeURIComponent(q)}`),
    );
    setCourses(data.courses);
    setClasses(data.classes);
    setAdoptions(data.adoptions);
    setCanAdopt(data.canAdopt);
    setSignedIn(true);
    setMessage(`共 ${data.courses.length} 門已發布課程。`);
  }

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (user) void load().catch(() => setSignedIn(false));
  }), []);

  async function login() {
    try {
      await signInWithGoogle();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    try {
      await load(query);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜尋失敗。");
    }
  }

  async function open(id: string) {
    try {
      const data = await json<{ course: Detail }>(await authorizedFetch(`/api/library?id=${encodeURIComponent(id)}`));
      setDetail(data.course);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取失敗。");
    }
  }

  async function adopt(classId: string) {
    if (!detail) return;
    await mutateAdoption(
      () => authorizedFetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, courseVersionId: detail.version.id }),
      }),
      "課程已採用到班級，並鎖定目前版本。",
    );
  }

  async function adoptionAction(action: "toggle" | "upgrade" | "move", adoptionId: string, direction?: "up" | "down") {
    await mutateAdoption(
      () => authorizedFetch("/api/library", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, adoptionId, direction }),
      }),
      action === "upgrade" ? "班級已升級到最新課程版本。" : action === "toggle" ? "班級課程狀態已更新。" : "班級課程順序已更新。",
    );
  }

  async function mutateAdoption(request: () => Promise<Response>, success: string) {
    try {
      await json(await request());
      await load(query);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "班級課程操作失敗。");
    }
  }

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <Link href="/">← 回首頁</Link>
          <p className="eyebrow">Public Course Library</p>
          <h1>Scratch 公開課程庫</h1>
          <p>所有課程皆經管理員審核；班級採用後固定使用當時版本。</p>
        </div>
        <div>
          {!signedIn && <button onClick={login}>Google 登入</button>}
          <Link href="/studio">前往課程設計室</Link>
        </div>
      </header>
      <div className="studio-message">{message}</div>
      {signedIn && (
        <form className="library-search" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋課程名稱、摘要或標籤" />
          <button>搜尋</button>
        </form>
      )}
      <div className="library-layout">
        <section className="library-grid">
          {courses.map((course) => {
            const adopted = adoptions.filter((item) => item.course_id === course.id);
            const hasUpdate = adopted.some((item) => item.adopted_version_no < item.latest_version_no);
            let tags: string[] = [];
            try { tags = JSON.parse(course.tags_json); } catch { tags = []; }
            return (
              <article className="library-card" key={course.id}>
                <div>
                  <span>{course.region || "公開課程"} · v{course.version_no}</span>
                  <h2>{course.title}</h2>
                  <p>{course.summary}</p>
                </div>
                <div className="tag-row">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <small>{course.owner_name} · {course.lesson_count} 堂 · {course.question_count} 題</small>
                {adopted.length > 0 && <b>已由 {adopted.length} 個班級採用{hasUpdate ? " · 有新版可更新" : ""}</b>}
                <button onClick={() => void open(course.id)}>查看課程</button>
              </article>
            );
          })}
        </section>
        {detail && (
          <aside className="library-detail">
            <button className="ghost" onClick={() => setDetail(null)}>關閉</button>
            <p className="eyebrow">v{detail.version.versionNo}</p>
            <h2>{detail.title}</h2>
            <p>{detail.summary}</p>
            <dl>
              <div><dt>作者</dt><dd>{detail.ownerName}</dd></div>
              <div><dt>對象</dt><dd>{detail.educationStage || "未指定"}</dd></div>
            </dl>
            {detail.lessons.map((lesson, index) => (
              <section key={lesson.id}>
                <h3>{index + 1}. {lesson.title}</h3>
                <p>{lesson.objective}</p>
                {lesson.questions.map((question) => (
                  <div className="library-question" key={question.id}>
                    <strong>{question.title}</strong>
                    <p>{question.prompt}</p>
                    <small>{question.estimatedMinutes} 分鐘 · {question.rules.length} 項檢核</small>
                  </div>
                ))}
              </section>
            ))}
            {canAdopt && (
              <div className="adopt-box">
                <strong>班級採用與版本管理</strong>
                {classes.map((item) => {
                  const adoption = adoptions.find((row) => row.class_id === item.id && row.course_id === detail.id);
                  if (!adoption) return <button key={item.id} onClick={() => void adopt(item.id)}>採用到 {item.name}（{item.code}）</button>;
                  const outdated = adoption.adopted_version_no < adoption.latest_version_no;
                  return (
                    <div className="adoption-row" key={item.id}>
                      <span>{item.name} · v{adoption.adopted_version_no} · {adoption.status === "active" ? "已開放" : "已關閉"}</span>
                      <div>
                        {outdated && <button onClick={() => void adoptionAction("upgrade", adoption.id)}>更新至 v{adoption.latest_version_no}</button>}
                        <button className="ghost" onClick={() => void adoptionAction("toggle", adoption.id)}>{adoption.status === "active" ? "關閉" : "開放"}</button>
                        <button className="ghost" aria-label="向上排序" onClick={() => void adoptionAction("move", adoption.id, "up")}>↑</button>
                        <button className="ghost" aria-label="向下排序" onClick={() => void adoptionAction("move", adoption.id, "down")}>↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
