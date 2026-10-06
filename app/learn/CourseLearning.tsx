"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { chapters, playlistEmbedUrl } from "../course-data";
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

type StudentClassItem = {
  membership_id: string;
  class_id: string;
  class_name: string;
  class_code: string;
  seat_no: string;
  nickname: string;
  status: string;
  school_name?: string;
  course_count: number;
  passed_count: number;
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
    description: string;
    badgeName: string;
    sortOrder: number;
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
  const [classes, setClasses] = useState<StudentClassItem[]>([]);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [className, setClassName] = useState("");
  const [selectedAdoptionId, setSelectedAdoptionId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [assignmentEnabled, setAssignmentEnabled] = useState(false);
  const [projectUrl, setProjectUrl] = useState("");
  const [savedProjectUrl, setSavedProjectUrl] = useState("");
  const [message, setMessage] = useState("正在確認 Google 登入狀態…");
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);

  async function load() {
    const data = await json<{ courses: CourseItem[]; classes: StudentClassItem[] }>(await authorizedFetch("/api/student/courses"));
    setCourses(data.courses);
    setClasses(data.classes);
    setMessage(`目前已加入 ${data.classes.length} 個班級，共開放 ${data.courses.length} 門課程。`);
  }

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    setAuthReady(true);
    setAccountEmail(user?.email ?? "");
    if (user) {
      void load().catch((error) => setMessage(error instanceof Error ? error.message : "無法讀取班級資料。"));
    } else {
      setCourses([]);
      setClasses([]);
      setMessage("請先使用 Google 帳號登入，再加入班級。");
    }
  }), []);

  async function login() {
    setBusy(true);
    try {
      const google = await signInWithGoogle();
      setAccountEmail(google.email);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const currentUser = firebaseAuth.currentUser;
      const google = currentUser
        ? { idToken: await currentUser.getIdToken(), email: currentUser.email ?? "" }
        : await signInWithGoogle();
      setAccountEmail(google.email);
      await json(await fetch("/api/student/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classCode: form.get("classCode"),
          seatNo: form.get("seatNo"),
          nickname: form.get("nickname"),
          idToken: google.idToken,
        }),
      }));
      formElement.reset();
      setJoinOpen(false);
      await load();
      setMessage("已成功加入班級。新班級已顯示在下方。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加入班級失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function open(item: CourseItem, preferredLessonId = "") {
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
      setSelectedLessonId(
        data.course.lessons.some((lesson) => lesson.id === preferredLessonId)
          ? preferredLessonId
          : data.course.lessons[0]?.id ?? ""
      );
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
      if (selected) await open(selected, selectedLessonId);
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
  const selectedLesson = course?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? course?.lessons[0] ?? null;
  const knownChapter = selectedLesson
    ? chapters.find((chapter) => chapter.title === selectedLesson.title)
    : undefined;
  const lessonVideos = selectedLesson
    ? knownChapter?.videoIds.map((id, index) => ({ id, title: knownChapter.videoTitles[index] }))
      ?? videosFromQuestions(selectedLesson.questions)
    : [];

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <HomeBackButton>← 回首頁</HomeBackButton>
          <p className="eyebrow">My Courses</p>
          <h1>我的班級</h1>
          <p>查看已加入的班級與課程，也可以使用班級代碼加入新班級。</p>
        </div>
        <div className="learning-header-actions">
          <Link className="text-link" href="/?mode=account">我的帳號</Link>
          <button type="button" onClick={() => setJoinOpen((current) => !current)} aria-expanded={joinOpen}>
            {joinOpen ? "收起加入表單" : "加入班級"}
          </button>
          {accountEmail ? (
            <span className="learning-account-chip" title={accountEmail}>已登入 {accountEmail}</span>
          ) : (
            <button onClick={login} disabled={!authReady || busy}>
              {authReady ? "學生 Google 登入" : "確認登入狀態…"}
            </button>
          )}
        </div>
      </header>
      <div className="studio-message">{message}</div>
      {joinOpen && (
        <form className="student-class-join" onSubmit={joinClass}>
          <div>
            <p className="eyebrow">Join Class</p>
            <h2>加入班級</h2>
            <p>向老師取得班級代碼，使用目前的 Google 帳號加入。</p>
          </div>
          <label>班級代碼<input name="classCode" placeholder="YL-ABCDE" autoComplete="off" required /></label>
          <label>座號<input name="seatNo" placeholder="例如 08" autoComplete="off" required /></label>
          <label>暱稱<input name="nickname" placeholder="例如 小宜" autoComplete="nickname" required /></label>
          <button disabled={!authReady || busy}>{accountEmail ? "確認加入" : "登入並加入"}</button>
        </form>
      )}
      <section className="student-class-summary" aria-label="已加入班級">
        <div className="student-class-summary__heading">
          <div><p className="eyebrow">Classes</p><h2>已加入班級</h2></div>
          <span>{classes.length} 個班級</span>
        </div>
        {classes.length > 0 ? (
          <div className="student-class-grid">
            {classes.map((item) => (
              <article key={item.membership_id}>
                <div><span>{item.school_name || "宜蘭縣"}</span><strong>{item.class_name}</strong></div>
                <dl>
                  <div><dt>座號</dt><dd>{item.seat_no} 號</dd></div>
                  <div><dt>課程</dt><dd>{item.course_count} 門</dd></div>
                  <div><dt>已完成</dt><dd>{item.passed_count} 題</dd></div>
                </dl>
                <small className={item.status === "active" ? "is-active" : "is-disabled"}>
                  {item.status === "active" ? "已啟用" : "已停用"}
                </small>
                <div className="student-class-course-actions">
                  {courses.filter((courseItem) => courseItem.class_id === item.class_id).map((courseItem) => (
                    <button
                      type="button"
                      key={courseItem.adoption_id}
                      disabled={item.status !== "active"}
                      onClick={() => void open(courseItem)}
                    >
                      進入 {courseItem.title}
                    </button>
                  ))}
                  {item.course_count === 0 && <span>老師尚未開放課程</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="student-class-empty">
            <strong>尚未加入班級</strong>
            <p>請點選「加入班級」並輸入老師提供的班級代碼。</p>
          </div>
        )}
      </section>
      {!course ? (
        <div className="learning-course-empty">
          <h2>{courses.length > 0 ? "選擇一個班級開始學習" : "目前沒有已開放的課程"}</h2>
          <p>{courses.length > 0 ? "請在上方班級卡片點選「進入課程」。" : "加入班級後，老師開放的課程會顯示在這裡。"}</p>
        </div>
      ) : (
        <div className="learning-layout learning-layout--course">
          <aside className="learning-chapter-nav">
            <div>
              <small>{className}</small>
              <h2>{course.title}</h2>
              <span>版本 {course.version.versionNo}</span>
            </div>
            <nav aria-label="課程章節">
              {course.lessons.map((lesson, index) => {
                const passed = lesson.questions.filter((question) => status(question.id)?.status === "passed").length;
                return (
                  <button
                    type="button"
                    key={lesson.id}
                    className={selectedLesson?.id === lesson.id ? "active" : ""}
                    aria-pressed={selectedLesson?.id === lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                  >
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <span><strong>{lesson.title}</strong><small>{passed}/{lesson.questions.length} 項完成</small></span>
                  </button>
                );
              })}
            </nav>
          </aside>
          <section className="learning-module">
            {selectedLesson && (
              <>
                <header className="learning-module__header">
                  <div>
                    <p className="eyebrow">第 {selectedLesson.sortOrder + 1} 章</p>
                    <h2>{selectedLesson.title}</h2>
                    <p>{course.summary}</p>
                  </div>
                  {selectedLesson.badgeName && <span>完成徽章 <strong>{selectedLesson.badgeName}</strong></span>}
                </header>

                <section className="learning-module__section">
                  <div className="learning-module__section-title"><span>01</span><h3>學習目標</h3></div>
                  <p>{selectedLesson.objective}</p>
                </section>

                <section className="learning-module__section">
                  <div className="learning-module__section-title"><span>02</span><h3>內容說明</h3></div>
                  <p>{selectedLesson.description || selectedLesson.objective}</p>
                </section>

                <section className="learning-module__section">
                  <div className="learning-module__section-title"><span>03</span><h3>章節影片</h3></div>
                  {lessonVideos.length > 0 ? (
                    <div className="learning-video-grid">
                      {lessonVideos.map((video) => (
                        <div key={video.id}>
                          <h4>{video.title}</h4>
                          <div className="video-frame">
                            <iframe
                              title={video.title}
                              src={playlistEmbedUrl(video.id)}
                              loading="lazy"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="learning-empty-note">本章尚未設定教學影片。</p>}
                </section>

                <section className="learning-module__section">
                  <div className="learning-module__section-title"><span>04</span><h3>上傳檢核</h3></div>
                  <div className="learning-question-list">
                    {selectedLesson.questions.map((question) => {
                      const result = status(question.id);
                      return (
                        <section className="learning-question" key={question.id}>
                          <div>
                            <h3>{question.title}</h3>
                            <p>{questionDescription(question.prompt)}</p>
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
                  </div>
                </section>

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
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function questionDescription(prompt: string) {
  return prompt.split(/\n\n教學影片：/)[0]?.trim() || prompt;
}

function videosFromQuestions(questions: CourseDetail["lessons"][number]["questions"]) {
  const videos = new Map<string, string>();
  for (const question of questions) {
    const videoId = question.prompt.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1];
    if (!videoId || videos.has(videoId)) continue;
    const title = question.prompt.match(/教學影片：([^\n]+)/)?.[1]?.trim() || question.title;
    videos.set(videoId, title);
  }
  return [...videos].map(([id, title]) => ({ id, title }));
}
