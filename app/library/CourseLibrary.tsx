"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { authorizedFetch, firebaseAuth } from "../firebase-client";

type LibraryCourse = {
  id: string; title: string; summary: string; school_year: string; region: string;
  education_stage: string; tags_json: string; current_version_id: string;
  owner_name: string; version_no: number; lesson_count: number; question_count: number;
};
type ClassInfo = { id: string; name: string; code: string };
type Adoption = {
  id: string; class_id: string; class_name: string; course_id: string;
  adopted_version_no: number; latest_version_no: number; sort_order: number; status: string;
  assignment_enabled: number;
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

function libraryFetch(path: string, authenticated: boolean) {
  return authenticated ? authorizedFetch(path) : fetch(path);
}

export function CourseLibrary({ embedded = false }: { embedded?: boolean }) {
  const [courses, setCourses] = useState<LibraryCourse[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [adoptions, setAdoptions] = useState<Adoption[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("正在載入公開課程…");
  const [canAdopt, setCanAdopt] = useState(false);

  const load = useCallback(async (q = "", authenticated = Boolean(firebaseAuth.currentUser)) => {
    const data = await json<{ courses: LibraryCourse[]; classes: ClassInfo[]; adoptions: Adoption[]; canAdopt: boolean }>(
      await libraryFetch(`/api/library?q=${encodeURIComponent(q)}`, authenticated),
    );
    setCourses(data.courses);
    setClasses(data.classes);
    setAdoptions(data.adoptions);
    setCanAdopt(data.canAdopt);
    setMessage(`共 ${data.courses.length} 門已發布課程。`);
  }, []);

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    void load("", Boolean(user)).catch((error) => {
      setMessage(error instanceof Error ? error.message : "公開課程載入失敗。");
    });
  }), [load]);

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
      const data = await json<{ course: Detail }>(await libraryFetch(`/api/library?id=${encodeURIComponent(id)}`, Boolean(firebaseAuth.currentUser)));
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

  async function adoptionAction(action: "toggle" | "toggle_assignment" | "upgrade" | "move", adoptionId: string, direction?: "up" | "down") {
    await mutateAdoption(
      () => authorizedFetch("/api/library", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, adoptionId, direction }),
      }),
      action === "upgrade"
        ? "班級已升級到最新課程版本。"
        : action === "toggle"
          ? "班級課程狀態已更新。"
          : action === "toggle_assignment"
            ? "課程作業設定已更新。"
            : "班級課程順序已更新。",
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

  const Shell = embedded ? "div" : "main";

  return (
    <Shell className={`library-shell ${embedded ? "library-shell--embedded" : ""}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Public Course Library</p>
          <h1>Scratch 公開課程庫</h1>
          <p>所有課程皆經管理員審核；班級採用後固定使用當時版本。</p>
        </div>
      </header>
      <div className="studio-message">{message}</div>
      <form className="library-search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋課程名稱、摘要或標籤" />
        <button>搜尋</button>
      </form>
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
                      <label className="assignment-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(adoption.assignment_enabled)}
                          disabled={adoption.status !== "active"}
                          onChange={() => void adoptionAction("toggle_assignment", adoption.id)}
                        />
                        <span>開啟作業</span>
                      </label>
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
    </Shell>
  );
}
