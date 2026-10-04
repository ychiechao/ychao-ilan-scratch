"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { authorizedFetch, firebaseAuth, signInWithGoogle } from "../firebase-client";
import { inspectScratchProject } from "../scratch-project";
import { HomeBackButton } from "../HardNavigationLink";

type CourseItem = {
  adoption_id: string;
  membership_id: string;
  class_id: string;
  class_name: string;
  course_id: string;
  title: string;
  summary: string;
  owner_name: string;
  version_no: number;
  lesson_count: number;
  question_count: number;
  passed_count: number;
  assignment_enabled: number;
  project_url?: string;
};

type CourseDetail = {
  id: string;
  title: string;
  summary: string;
  version: { versionNo: number };
  lessons: Array<{
    id: string;
    title: string;
    objective: string;
    questions: Array<{
      id: string;
      title: string;
      prompt: string;
      estimatedMinutes: number;
      rules: Array<{ id: string; label: string; weight: number; mode: string }>;
    }>;
  }>;
};

type Progress = { question_id: string; score: number; status: string; results_json: string };

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失敗。");
  return data as T;
}

export function CourseLearning() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [className, setClassName] = useState("");
  const [selectedAdoptionId, setSelectedAdoptionId] = useState("");
  const [assignmentEnabled, setAssignmentEnabled] = useState(false);
  const [projectUrl, setProjectUrl] = useState("");
  const [savedProjectUrl, setSavedProjectUrl] = useState("");
  const [message, setMessage] = useState("請使用已加入班級的學生 Google 帳號登入。");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await json<{ courses: CourseItem[] }>(await authorizedFetch("/api/student/courses"));
    setCourses(data.courses);
    const classCount = new Set(data.courses.map((item) => item.class_id)).size;
    setMessage(`目前有 ${classCount} 個班級，共開放 ${data.courses.length} 門課程。`);
  }

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (user) void load().catch(() => undefined);
  }), []);

  async function login() {
    setBusy(true);
    try {
      const google = await signInWithGoogle();
      await json(await fetch("/api/student/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: google.idToken }),
      }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function open(item: CourseItem) {
    try {
      const query = new URLSearchParams({ id: item.course_id, adoptionId: item.adoption_id });
      const data = await json<{
        course: CourseDetail;
        progress: Progress[];
        membershipId: string;
        class: { id: string; name: string };
        assignment: { enabled: boolean; projectUrl: string };
      }>(await authorizedFetch(`/api/student/courses?${query}`));
      setCourse(data.course);
      setProgress(data.progress);
      setMembershipId(data.membershipId);
      setClassName(data.class.name);
      setSelectedAdoptionId(item.adoption_id);
      setAssignmentEnabled(data.assignment.enabled);
      setProjectUrl(data.assignment.projectUrl);
      setSavedProjectUrl(data.assignment.projectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取失敗。");
    }
  }

  async function submit(questionId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !course || !membershipId) return;
    setBusy(true);
    try {
      const analysis = await inspectScratchProject(file);
      const data = await json<{
        evaluation: { score: number; passed: boolean; status: string; results: Array<{ ruleId: string; passed: boolean | null; detail: string }> };
      }>(await authorizedFetch("/api/question-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId, questionId, fileName: file.name, fileSize: file.size, analysis }),
      }));
      setMessage(data.evaluation.passed
        ? `檢核通過，得分 ${data.evaluation.score}。`
        : `作品尚有項目需要修正，目前 ${data.evaluation.score} 分。`);
      const selected = courses.find((item) => item.adoption_id === selectedAdoptionId);
      if (selected) await open(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "檢核失敗。");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipId || !selectedAdoptionId || !projectUrl) return;
    setBusy(true);
    try {
      const data = await json<{ projectUrl: string }>(await authorizedFetch("/api/course-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId, adoptionId: selectedAdoptionId, projectUrl }),
      }));
      setProjectUrl(data.projectUrl);
      setSavedProjectUrl(data.projectUrl);
      setCourses((current) => current.map((item) => item.adoption_id === selectedAdoptionId
        ? { ...item, project_url: data.projectUrl }
        : item));
      setMessage("作業網址已儲存，老師可以直接開啟查看。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作業網址儲存失敗。");
    } finally {
      setBusy(false);
    }
  }

  const status = (id: string) => progress.find((item) => item.question_id === id);

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <HomeBackButton>← 回首頁</HomeBackButton>
          <p className="eyebrow">My Courses</p>
          <h1>我的課程</h1>
          <p>同一個 Google 帳號可加入多個班級，各班進度分開保存。</p>
        </div>
        <div className="learning-header-actions">
          <Link className="text-link" href="/?mode=student#student-entry">加入其他班級</Link>
          <button onClick={login} disabled={busy}>學生 Google 登入</button>
        </div>
      </header>
      <div className="studio-message">{message}</div>
      <div className="learning-layout">
        <aside>
          {courses.map((item) => (
            <button
              key={item.adoption_id}
              className={selectedAdoptionId === item.adoption_id ? "active" : ""}
              onClick={() => void open(item)}
            >
              <small>{item.class_name}</small>
              <strong>{item.title}</strong>
              <span>v{item.version_no} · {item.passed_count}/{item.question_count} 題完成</span>
              {Boolean(item.assignment_enabled) && <span>{item.project_url ? "作業已繳交" : "作業已開啟"}</span>}
            </button>
          ))}
        </aside>
        <section>
          {!course ? (
            <div className="studio-empty"><h2>選擇班級課程</h2></div>
          ) : (
            <>
              <div className="studio-card">
                <p className="eyebrow">{className} · 版本 {course.version.versionNo}</p>
                <h2>{course.title}</h2>
                <p>{course.summary}</p>
              </div>
              {assignmentEnabled && (
                <form className="course-project-submit" onSubmit={submitProject}>
                  <div>
                    <p className="eyebrow">Course Assignment</p>
                    <h3>課程作業</h3>
                    <p>貼上你的作品網址。重新儲存會更新老師看到的連結。</p>
                  </div>
                  <label>
                    作品網址
                    <input
                      type="url"
                      value={projectUrl}
                      onChange={(event) => setProjectUrl(event.target.value)}
                      placeholder="https://s3.ilc.edu.tw/projects/356121701/"
                      required
                    />
                  </label>
                  <div className="course-project-submit__actions">
                    {savedProjectUrl && <a href={savedProjectUrl} target="_blank" rel="noreferrer">查看作品</a>}
                    <button disabled={busy}>儲存作業網址</button>
                  </div>
                </form>
              )}
              {course.lessons.map((lesson, index) => (
                <article className="studio-card learning-lesson" key={lesson.id}>
                  <h2>{index + 1}. {lesson.title}</h2>
                  <p>{lesson.objective}</p>
                  {lesson.questions.map((question) => {
                    const result = status(question.id);
                    return (
                      <section className="learning-question" key={question.id}>
                        <div>
                          <h3>{question.title}</h3>
                          <p>{question.prompt}</p>
                          <small>{question.estimatedMinutes} 分鐘 · {question.rules.length} 項檢核</small>
                        </div>
                        <div>
                          <b className={result?.status === "passed" ? "total-ok" : "total-bad"}>
                            {result ? `${result.score} 分／${result.status === "passed" ? "通過" : "待修正"}` : "尚未檢核"}
                          </b>
                          <label className="button-label">
                            選擇 .sb3 自我檢核
                            <input type="file" accept=".sb3" hidden disabled={busy} onChange={(event) => void submit(question.id, event)} />
                          </label>
                        </div>
                      </section>
                    );
                  })}
                </article>
              ))}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
