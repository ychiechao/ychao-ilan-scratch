"use client";

import { FormEvent, useMemo, useState } from "react";
import { chapters, playlistUrl } from "./course-data";

type Teacher = { id: string; name: string; email: string };
type ClassInfo = { id: string; teacherId?: string; teacher_id?: string; name: string; code: string; createdAt?: string };
type Student = { id: string; classId?: string; class_id?: string; seatNo?: string; seat_no?: string; nickname: string };
type Submission = {
  id: string;
  student_id?: string;
  studentId?: string;
  chapter_no?: number;
  chapterNo?: number;
  file_name?: string;
  fileName?: string;
  auto_score?: number;
  autoScore?: number;
  status: string;
  feedback?: string;
  updated_at?: string;
  updatedAt?: string;
};
type Badge = {
  id: string;
  student_id?: string;
  studentId?: string;
  chapter_no?: number;
  chapterNo?: number;
  badge_name?: string;
  badgeName?: string;
  earned_at?: string;
};

type Dashboard = {
  class: ClassInfo | null;
  students: Student[];
  submissions: Submission[];
  badges: Badge[];
};

type Notice = { type: "success" | "error" | "info"; text: string } | null;

const emptyDashboard: Dashboard = {
  class: null,
  students: [],
  submissions: [],
  badges: [],
};

function chapterNumber(item: Submission | Badge) {
  return item.chapterNo ?? item.chapter_no ?? 0;
}

function studentIdOf(item: Submission | Badge) {
  return item.studentId ?? item.student_id ?? "";
}

function seatOf(student: Student) {
  return student.seatNo ?? student.seat_no ?? "";
}

function statusLabel(status?: string) {
  if (status === "passed") return "通過";
  if (status === "needs_fix") return "待修正";
  return "未開始";
}

function initialMode(): "student" | "teacher" | "map" {
  if (typeof window === "undefined") return "student";

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "teacher" || mode === "map") return mode;
  return "student";
}

function initialChapter() {
  if (typeof window === "undefined") return 1;

  const chapterNo = Number(new URLSearchParams(window.location.search).get("chapter"));
  return chapters.some((chapter) => chapter.no === chapterNo) ? chapterNo : 1;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "操作失敗，請稍後再試。");
  }
  return data as T;
}

function readStored<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export function CourseApp() {
  const [mode, setMode] = useState<"student" | "teacher" | "map">(initialMode);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(() => readStored("scratch-teacher"));
  const [classes, setClasses] = useState<ClassInfo[]>(() => readStored("scratch-classes") ?? []);
  const [selectedClassId, setSelectedClassId] = useState(
    () => readStored<ClassInfo[]>("scratch-classes")?.[0]?.id ?? ""
  );
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [student, setStudent] = useState<Student | null>(() => readStored("scratch-student"));
  const [studentClass, setStudentClass] = useState<ClassInfo | null>(() => readStored("scratch-student-class"));
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [checked, setChecked] = useState<Record<number, string[]>>({});
  const [selectedChapter, setSelectedChapter] = useState(initialChapter);

  const earnedCount = badges.length;
  const progressPercent = Math.round((earnedCount / chapters.length) * 100);

  const submissionMap = useMemo(() => {
    const map = new Map<number, Submission>();
    submissions.forEach((submission) => map.set(chapterNumber(submission), submission));
    return map;
  }, [submissions]);

  const badgeMap = useMemo(() => {
    const map = new Map<number, Badge>();
    badges.forEach((badge) => map.set(chapterNumber(badge), badge));
    return map;
  }, [badges]);

  function show(type: Notice["type"], text: string) {
    setNotice({ type, text });
  }

  async function refreshStudent(studentId: string) {
    const data = await readJson<{
      submissions: Submission[];
      badges: Badge[];
      class?: ClassInfo;
    }>(await fetch(`/api/student/progress?studentId=${encodeURIComponent(studentId)}`));
    setSubmissions(data.submissions);
    setBadges(data.badges);
    if (data.class) setStudentClass(data.class);
  }

  async function refreshDashboard(classId: string, teacherId = teacher?.id) {
    if (!teacherId) return;
    const data = await readJson<Dashboard>(
      await fetch(
        `/api/teacher/dashboard?teacherId=${encodeURIComponent(teacherId)}&classId=${encodeURIComponent(classId)}`
      )
    );
    setDashboard(data);
  }

  async function joinStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ student: Student; class: ClassInfo }>(
        await fetch("/api/student/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classCode: form.get("classCode"),
            seatNo: form.get("seatNo"),
            nickname: form.get("nickname"),
            pin: form.get("pin"),
          }),
        })
      );
      setStudent(data.student);
      setStudentClass(data.class);
      localStorage.setItem("scratch-student", JSON.stringify(data.student));
      localStorage.setItem("scratch-student-class", JSON.stringify(data.class));
      await refreshStudent(data.student.id);
      show("success", "已加入班級，可以開始上傳章節作品。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "加入班級失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function submitChapter(event: FormEvent<HTMLFormElement>, chapterNo: number) {
    event.preventDefault();
    if (!student) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    form.set("studentId", student.id);
    form.set("chapterNo", String(chapterNo));
    form.set("checklist", JSON.stringify(checked[chapterNo] ?? []));

    try {
      const data = await readJson<{ submissions: Submission[]; badges: Badge[]; submission: { status: string; badge: string | null } }>(
        await fetch("/api/submissions", { method: "POST", body: form })
      );
      setSubmissions(data.submissions);
      setBadges(data.badges);
      show(
        data.submission.status === "passed" ? "success" : "info",
        data.submission.badge
          ? `檢核通過，取得「${data.submission.badge}」徽章。`
          : "已上傳，還有檢核項目需要修正。"
      );
      if (teacher && selectedClassId) refreshDashboard(selectedClassId);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "上傳失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function registerTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ teacher: Teacher; classes: ClassInfo[] }>(
        await fetch("/api/teacher/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            pin: form.get("pin"),
            className: form.get("className"),
          }),
        })
      );
      setTeacher(data.teacher);
      setClasses(data.classes);
      setSelectedClassId(data.classes[0]?.id ?? "");
      setDashboard({
        class: data.classes[0] ?? null,
        students: [],
        submissions: [],
        badges: [],
      });
      localStorage.setItem("scratch-teacher", JSON.stringify(data.teacher));
      localStorage.setItem("scratch-classes", JSON.stringify(data.classes));
      show("success", `班級已建立，代碼是 ${data.classes[0]?.code ?? ""}。`);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "註冊失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function loginTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ teacher: Teacher; classes: ClassInfo[] }>(
        await fetch("/api/teacher/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), pin: form.get("pin") }),
        })
      );
      setTeacher(data.teacher);
      setClasses(data.classes);
      setSelectedClassId(data.classes[0]?.id ?? "");
      localStorage.setItem("scratch-teacher", JSON.stringify(data.teacher));
      localStorage.setItem("scratch-classes", JSON.stringify(data.classes));
      if (data.classes[0]) {
        await refreshDashboard(data.classes[0].id, data.teacher.id);
      }
      show("success", "老師後台已登入。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teacher) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ class: ClassInfo }>(
        await fetch("/api/classes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ teacherId: teacher.id, name: form.get("name") }),
        })
      );
      const nextClasses = [data.class, ...classes];
      setClasses(nextClasses);
      setSelectedClassId(data.class.id);
      setDashboard({
        class: data.class,
        students: [],
        submissions: [],
        badges: [],
      });
      localStorage.setItem("scratch-classes", JSON.stringify(nextClasses));
      show("success", `新班級代碼是 ${data.class.code}。`);
      event.currentTarget.reset();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "建立班級失敗。");
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(chapterNo: number, checkId: string) {
    setChecked((current) => {
      const list = new Set(current[chapterNo] ?? []);
      if (list.has(checkId)) list.delete(checkId);
      else list.add(checkId);
      return { ...current, [chapterNo]: [...list] };
    });
  }

  function logoutStudent() {
    localStorage.removeItem("scratch-student");
    localStorage.removeItem("scratch-student-class");
    setStudent(null);
    setStudentClass(null);
    setSubmissions([]);
    setBadges([]);
  }

  function logoutTeacher() {
    localStorage.removeItem("scratch-teacher");
    localStorage.removeItem("scratch-classes");
    setTeacher(null);
    setClasses([]);
    setDashboard(emptyDashboard);
  }

  const selected = chapters.find((chapter) => chapter.no === selectedChapter) ?? chapters[0];

  return (
    <main>
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">宜蘭縣國小程式設計自學</p>
          <h1>宜蘭 Scratch 基礎課程</h1>
          <p className="hero__copy">
            12 堂射擊遊戲課程，學生上傳 Scratch 作品完成自我檢核，老師即時掌握班級進度與徽章。
          </p>
          <div className="hero__actions">
            <button onClick={() => setMode("student")} className={mode === "student" ? "active" : ""}>
              學生入口
            </button>
            <button onClick={() => setMode("teacher")} className={mode === "teacher" ? "active" : ""}>
              老師後台
            </button>
            <button onClick={() => setMode("map")} className={mode === "map" ? "active" : ""}>
              課程地圖
            </button>
          </div>
        </div>
        <div className="hero__board" aria-label="課程進度總覽">
          <div>
            <span>12</span>
            <small>章節任務</small>
          </div>
          <div>
            <span>{student ? earnedCount : "D1"}</span>
            <small>{student ? "已取得徽章" : "進度資料"}</small>
          </div>
          <div>
            <span>{student ? `${progressPercent}%` : "R2"}</span>
            <small>{student ? "完成率" : "作品上傳"}</small>
          </div>
        </div>
      </section>

      {notice && <div className={`notice notice--${notice.type}`}>{notice.text}</div>}

      <section className="layout">
        <aside className="chapter-rail">
          <div className="rail-head">
            <span>章節</span>
            <a href={playlistUrl} target="_blank" rel="noreferrer">
              YouTube
            </a>
          </div>
          {chapters.map((chapter) => {
            const earned = badgeMap.has(chapter.no);
            return (
              <button
                key={chapter.no}
                className={`chapter-link ${selectedChapter === chapter.no ? "selected" : ""} ${earned ? "earned" : ""}`}
                onClick={() => {
                  setSelectedChapter(chapter.no);
                  if (mode === "map") return;
                }}
              >
                <span>{String(chapter.no).padStart(2, "0")}</span>
                <strong>{chapter.title}</strong>
                <small>{earned ? "已得徽章" : chapter.range}</small>
              </button>
            );
          })}
        </aside>

        <section className="workspace">
          {mode === "student" && (
            <div className="surface" id="student-entry">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Student</p>
                  <h2>學生學習與檢核</h2>
                </div>
                {student && (
                  <button className="ghost" onClick={logoutStudent}>
                    更換學生
                  </button>
                )}
              </div>

              {!student ? (
                <form className="form-grid" onSubmit={joinStudent}>
                  <label>
                    班級代碼
                    <input name="classCode" placeholder="YL-ABCDE" autoComplete="off" />
                  </label>
                  <label>
                    座號
                    <input name="seatNo" placeholder="例如 08" autoComplete="off" />
                  </label>
                  <label>
                    暱稱
                    <input name="nickname" placeholder="例如 小宜" autoComplete="nickname" />
                  </label>
                  <label>
                    學習 PIN
                    <input name="pin" type="password" minLength={4} placeholder="4 碼以上" />
                  </label>
                  <button disabled={busy}>加入班級</button>
                </form>
              ) : (
                <>
                  <div className="student-strip">
                    <div>
                      <span>{studentClass?.name ?? "Scratch 班級"}</span>
                      <strong>
                        {seatOf(student)} 號 {student.nickname}
                      </strong>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <b>{earnedCount}/12 徽章</b>
                  </div>

                  <ChapterSubmit
                    chapter={selected}
                    submission={submissionMap.get(selected.no)}
                    earned={badgeMap.has(selected.no)}
                    checked={checked[selected.no] ?? []}
                    busy={busy}
                    onToggle={toggleCheck}
                    onSubmit={submitChapter}
                  />

                  <div className="badge-wall">
                    {chapters.map((chapter) => (
                      <div key={chapter.no} className={`badge ${badgeMap.has(chapter.no) ? "badge--on" : ""}`}>
                        <span>{chapter.no}</span>
                        <strong>{chapter.badge}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {mode === "teacher" && (
            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Teacher</p>
                  <h2>老師開班與進度後台</h2>
                </div>
                {teacher && (
                  <button className="ghost" onClick={logoutTeacher}>
                    登出
                  </button>
                )}
              </div>

              {!teacher ? (
                <div className="teacher-auth">
                  <form onSubmit={registerTeacher}>
                    <h3>註冊並建立第一個班級</h3>
                    <label>
                      老師名稱
                      <input name="name" placeholder="例如 林老師" />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" placeholder="teacher@example.com" />
                    </label>
                    <label>
                      老師 PIN
                      <input name="pin" type="password" minLength={4} placeholder="4 碼以上" />
                    </label>
                    <label>
                      班級名稱
                      <input name="className" placeholder="例如 五年甲班 Scratch" />
                    </label>
                    <button disabled={busy}>建立班級代碼</button>
                  </form>

                  <form onSubmit={loginTeacher}>
                    <h3>老師登入</h3>
                    <label>
                      Email
                      <input name="email" type="email" placeholder="teacher@example.com" />
                    </label>
                    <label>
                      老師 PIN
                      <input name="pin" type="password" minLength={4} placeholder="4 碼以上" />
                    </label>
                    <button disabled={busy}>進入後台</button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="teacher-tools">
                    <div>
                      <span>目前老師</span>
                      <strong>{teacher.name}</strong>
                    </div>
                    <label>
                      班級
                      <select
                        value={selectedClassId}
                        onChange={(event) => {
                          setSelectedClassId(event.target.value);
                          void refreshDashboard(event.target.value);
                        }}
                      >
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} - {item.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <form onSubmit={createClass}>
                      <input name="name" placeholder="新增班級名稱" />
                      <button disabled={busy}>新增班級</button>
                    </form>
                    <button className="ghost" onClick={() => selectedClassId && refreshDashboard(selectedClassId)}>
                      更新後台
                    </button>
                  </div>

                  <TeacherDashboard dashboard={dashboard} />
                </>
              )}
            </div>
          )}

          {mode === "map" && (
            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Course Map</p>
                  <h2>12 堂電子書章節</h2>
                </div>
                <a className="text-link" href={playlistUrl} target="_blank" rel="noreferrer">
                  開啟播放清單
                </a>
              </div>
              <div className="course-grid">
                {chapters.map((chapter) => (
                  <article key={chapter.no} className={`course-card course-card--${chapter.color}`}>
                    <span>{chapter.range}</span>
                    <h3>{chapter.title}</h3>
                    <p>{chapter.objective}</p>
                    <div className="course-card__actions">
                      <b>{chapter.badge}</b>
                      <a href={`/chapters/${chapter.no}`}>進入章節頁</a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function ChapterSubmit({
  chapter,
  submission,
  earned,
  checked,
  busy,
  onToggle,
  onSubmit,
}: {
  chapter: (typeof chapters)[number];
  submission?: Submission;
  earned: boolean;
  checked: string[];
  busy: boolean;
  onToggle: (chapterNo: number, checkId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, chapterNo: number) => void;
}) {
  return (
    <article className={`chapter-panel chapter-panel--${chapter.color}`}>
      <div className="chapter-panel__head">
        <div>
          <span>{chapter.range}</span>
          <h3>{chapter.title}</h3>
          <p>{chapter.objective}</p>
        </div>
        <div className={`status-pill ${earned ? "status-pill--earned" : ""}`}>
          {earned ? chapter.badge : statusLabel(submission?.status)}
        </div>
      </div>

      <div className="video-list">
        {chapter.videoTitles.map((title) => (
          <span key={title}>{title}</span>
        ))}
      </div>

      <div className="chapter-tools">
        <a href={`/chapters/${chapter.no}`}>閱讀本章教材頁</a>
      </div>

      <form className="submit-box" onSubmit={(event) => onSubmit(event, chapter.no)}>
        <div className="check-list">
          {chapter.checks.map((item) => (
            <label key={item.id} className={checked.includes(item.id) ? "checked" : ""}>
              <input
                type="checkbox"
                checked={checked.includes(item.id)}
                onChange={() => onToggle(chapter.no, item.id)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <label className="file-field">
          上傳 Scratch 檔案
          <input name="file" type="file" accept=".sb3" />
        </label>
        <button disabled={busy}>送出檢核</button>
      </form>

      {submission && (
        <div className="latest">
          <span>最近上傳</span>
          <strong>{submission.file_name ?? submission.fileName}</strong>
          <b>{statusLabel(submission.status)}</b>
        </div>
      )}
    </article>
  );
}

function TeacherDashboard({ dashboard }: { dashboard: Dashboard }) {
  const badgeSet = new Set(
    dashboard.badges.map((badge) => `${studentIdOf(badge)}:${chapterNumber(badge)}`)
  );
  const submissionsByStudentChapter = new Map(
    dashboard.submissions.map((submission) => [
      `${studentIdOf(submission)}:${chapterNumber(submission)}`,
      submission,
    ])
  );

  return (
    <div className="dashboard">
      <div className="dashboard-summary">
        <div>
          <span>班級代碼</span>
          <strong>{dashboard.class?.code ?? "尚未選擇"}</strong>
        </div>
        <div>
          <span>學生數</span>
          <strong>{dashboard.students.length}</strong>
        </div>
        <div>
          <span>已發徽章</span>
          <strong>{dashboard.badges.length}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>學生</th>
              {chapters.map((chapter) => (
                <th key={chapter.no}>{chapter.no}</th>
              ))}
              <th>徽章</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.students.length === 0 && (
              <tr>
                <td colSpan={14}>學生加入班級後，進度會出現在這裡。</td>
              </tr>
            )}
            {dashboard.students.map((student) => {
              const total = dashboard.badges.filter((badge) => studentIdOf(badge) === student.id).length;
              return (
                <tr key={student.id}>
                  <td>
                    <strong>{seatOf(student)} 號</strong>
                    <span>{student.nickname}</span>
                  </td>
                  {chapters.map((chapter) => {
                    const key = `${student.id}:${chapter.no}`;
                    const submission = submissionsByStudentChapter.get(key);
                    const earned = badgeSet.has(key);
                    return (
                      <td key={chapter.no} className={earned ? "cell-pass" : submission ? "cell-wait" : ""}>
                        {earned ? "徽章" : submission ? "上傳" : "-"}
                      </td>
                    );
                  })}
                  <td>{total}/12</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
