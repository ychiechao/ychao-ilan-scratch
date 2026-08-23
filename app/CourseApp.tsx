"use client";

import { FormEvent, useMemo, useState } from "react";
import { chapters, playlistEmbedUrl, playlistUrl } from "./course-data";
import { analyzeScratchFile, type ScratchAnalysis } from "./scratch-analyzer";

type AppMode = "student" | "teacher" | "admin" | "map" | "chapter";

type Teacher = {
  id: string;
  name: string;
  email: string;
  role?: string;
  status?: string;
  mustChangePin?: boolean;
  must_change_pin?: number;
};
type ClassInfo = {
  id: string;
  teacherId?: string;
  teacher_id?: string;
  name: string;
  code: string;
  submissionUrl?: string;
  submission_url?: string;
  submissionLabel?: string;
  submission_label?: string;
  status?: string;
  createdAt?: string;
};
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
  external_status?: string;
  externalStatus?: string;
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

type AdminClass = ClassInfo & {
  teacher_name?: string;
  teacher_email?: string;
  student_count?: number;
};

type AdminDashboard = { teachers: Teacher[]; classes: AdminClass[] };

type NoticeType = "success" | "error" | "info";
type Notice = { type: NoticeType; text: string } | null;

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
  if (status === "ready_to_upload") return "待繳交作品";
  if (status === "uploaded") return "等待老師確認";
  if (status === "resubmit") return "請重新繳交";
  if (status === "needs_fix") return "待修正";
  return "未開始";
}

function submissionUrlOf(item?: ClassInfo | null) {
  return item?.submissionUrl ?? item?.submission_url ?? "";
}

function submissionLabelOf(item?: ClassInfo | null) {
  return item?.submissionLabel ?? item?.submission_label ?? "作品繳交連結";
}

function accountStatusLabel(status?: string) {
  if (status === "active") return "已啟用";
  if (status === "disabled") return "已停用";
  return "待審核";
}

function initialMode(): AppMode {
  if (typeof window === "undefined") return "student";

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "teacher" || mode === "admin" || mode === "map" || mode === "chapter") return mode;
  return "student";
}

function initialChapter() {
  if (typeof window === "undefined") return 1;

  const chapterNo = Number(new URLSearchParams(window.location.search).get("chapter"));
  return chapters.some((chapter) => chapter.no === chapterNo) ? chapterNo : 1;
}

async function readJson<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "操作失敗，請稍後再試。";
    throw new Error(message);
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
  const [mode, setMode] = useState<AppMode>(initialMode);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(() => readStored("scratch-teacher"));
  const [admin, setAdmin] = useState<Teacher | null>(() => readStored("scratch-admin"));
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard>({ teachers: [], classes: [] });
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
  const [scratchResults, setScratchResults] = useState<Record<string, ScratchAnalysis>>({});
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

  function show(type: NoticeType, text: string) {
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

  async function refreshAdmin(adminId = admin?.id) {
    if (!adminId) return;
    const data = await readJson<AdminDashboard>(
      await fetch("/api/admin/dashboard")
    );
    setAdminDashboard(data);
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

    try {
      const files = chapterNo === 3
        ? [form.get("file-glide"), form.get("file-coordinates")]
        : [form.get("file")];
      const scratchFiles = files.map((file) => validateScratchFile(file));
      await Promise.all(scratchFiles.map(async (file) => {
        const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
          throw new Error("這個檔案不像有效的 Scratch 作品，請從 Scratch 重新儲存。");
        }
      }));
      let checklist = checked[chapterNo] ?? [];
      if (chapterNo === 3) {
        const [glide, coordinates] = await Promise.all([
          analyzeScratchFile(scratchFiles[0], 3, "glide"),
          analyzeScratchFile(scratchFiles[1], 3, "coordinates"),
        ]);
        checklist = [...glide.passedIds, ...coordinates.passedIds];
        setScratchResults((current) => ({
          ...current,
          "3:glide": glide,
          "3:coordinates": coordinates,
        }));
        setChecked((current) => ({ ...current, [chapterNo]: checklist }));
      } else if (isAutomaticChapter(chapterNo)) {
        const analysis = await analyzeScratchFile(scratchFiles[0], chapterNo);
        checklist = analysis.passedIds;
        setScratchResults((current) => ({ ...current, [`${chapterNo}:default`]: analysis }));
        setChecked((current) => ({ ...current, [chapterNo]: checklist }));
      }
      const data = await readJson<{
        submissions: Submission[];
        badges: Badge[];
        submission: { status: string; score: number; missing: string[] };
      }>(
        await fetch("/api/submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            studentId: student.id,
            chapterNo,
            checklist,
            fileName: scratchFiles.map((file) => file.name).join(" / "),
            fileSize: scratchFiles.reduce((sum, file) => sum + file.size, 0),
          }),
        })
      );
      setSubmissions(data.submissions);
      setBadges(data.badges);
      show(
        data.submission.status === "passed" ? "success" : "info",
        data.submission.status === "passed"
          ? "檢核通過，已取得本章徽章。"
          : data.submission.status === "ready_to_upload"
            ? "自我檢核通過，接著請到老師指定的雲端空間繳交。"
            : data.submission.missing.length > 0
              ? `還有 ${data.submission.missing.length} 項需要修正，請查看下方檢核結果。`
              : "還有檢核項目需要修正。"
      );
      if (teacher && selectedClassId) refreshDashboard(selectedClassId);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "上傳失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function markExternalUploaded(submissionId: string) {
    if (!student) return;
    setBusy(true);
    try {
      const data = await readJson<{ submissions: Submission[]; badges: Badge[] }>(
        await fetch("/api/submissions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "mark_uploaded", studentId: student.id, submissionId }),
        })
      );
      setSubmissions(data.submissions);
      setBadges(data.badges);
      show("success", "已通知老師，收到確認後就會取得徽章。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法回報繳交狀態。");
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmissionSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ class: ClassInfo }>(
        await fetch("/api/classes", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            teacherId: teacher.id,
            classId: selectedClassId,
            submissionUrl: form.get("submissionUrl"),
            submissionLabel: form.get("submissionLabel"),
          }),
        })
      );
      const nextClasses = classes.map((item) => item.id === data.class.id ? data.class : item);
      setClasses(nextClasses);
      setDashboard((current) => ({ ...current, class: data.class }));
      localStorage.setItem("scratch-classes", JSON.stringify(nextClasses));
      show("success", submissionUrlOf(data.class) ? "已儲存這個班級的作品繳交連結。" : "已取消這個班級的外部繳交。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法儲存繳交設定。");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSubmission(submissionId: string, action: "confirm" | "resubmit") {
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/submissions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, teacherId: teacher.id, submissionId }),
        })
      );
      await refreshDashboard(selectedClassId);
      show("success", action === "confirm" ? "已確認收到作品並發放徽章。" : "已通知學生重新繳交。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法更新作品狀態。");
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
      if (data.teacher.role === "superadmin") {
        const session = await readJson<{ admin: Teacher }>(
          await fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: form.get("email"), pin: form.get("pin") }),
          })
        );
        setAdmin(session.admin);
        localStorage.setItem("scratch-admin", JSON.stringify(session.admin));
        setMode("admin");
        await refreshAdmin(session.admin.id);
        show("success", "超級管理者帳號已建立。");
      } else {
        show("success", `註冊完成，班級代碼是 ${data.classes[0]?.code ?? ""}，請等待超管啟用。`);
      }
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
      if (data.teacher.role === "superadmin") {
        const session = await readJson<{ admin: Teacher }>(
          await fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: form.get("email"), pin: form.get("pin") }),
          })
        );
        setAdmin(session.admin);
        localStorage.setItem("scratch-admin", JSON.stringify(session.admin));
        setMode("admin");
        await refreshAdmin(session.admin.id);
      } else if (data.classes[0] && data.teacher.status === "active") {
        await refreshDashboard(data.classes[0].id, data.teacher.id);
      }
      show("success", data.teacher.status === "active" ? "老師後台已登入。" : "帳號尚未啟用，請等待超管審核。");
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
      show("success", `新班級代碼是 ${data.class.code}，請等待超管啟用。`);
      event.currentTarget.reset();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "建立班級失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ admin: Teacher }>(
        await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), pin: form.get("pin") }),
        })
      );
      setAdmin(data.admin);
      localStorage.setItem("scratch-admin", JSON.stringify(data.admin));
      await refreshAdmin(data.admin.id);
      show("success", "超級管理後台已登入。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "超管登入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function runAdminAction(payload: Record<string, unknown>, successMessage: string) {
    if (!admin) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/admin/actions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );
      await refreshAdmin(admin.id);
      show("success", successMessage);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "管理操作失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function resetTeacherPin(event: FormEvent<HTMLFormElement>, teacherId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAdminAction(
      { action: "reset_teacher_pin", teacherId, newPin: form.get("newPin") },
      "已設定臨時 PIN，請口頭通知老師。"
    );
    event.currentTarget.reset();
  }

  async function changeTeacherPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teacher) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/teacher/pin", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ teacherId: teacher.id, currentPin: form.get("currentPin"), newPin: form.get("newPin") }),
        })
      );
      const nextTeacher = { ...teacher, mustChangePin: false };
      setTeacher(nextTeacher);
      localStorage.setItem("scratch-teacher", JSON.stringify(nextTeacher));
      event.currentTarget.reset();
      show("success", "PIN 已更新。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法更新 PIN。");
    } finally {
      setBusy(false);
    }
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>, studentId?: string) {
    event.preventDefault();
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/teacher/students", {
          method: studentId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            teacherId: teacher.id,
            classId: selectedClassId,
            studentId,
            seatNo: form.get("seatNo"),
            nickname: form.get("nickname"),
            pin: form.get("pin"),
          }),
        })
      );
      await refreshDashboard(selectedClassId);
      if (!studentId) event.currentTarget.reset();
      show("success", studentId ? "學生資料與 PIN 已更新。" : "已新增學生。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法儲存學生資料。");
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(student: Student) {
    if (!teacher || !selectedClassId) return;
    if (!window.confirm(`確定剔除 ${seatOf(student)} 號 ${student.nickname}？繳交與徽章也會刪除。`)) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/teacher/students", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ teacherId: teacher.id, classId: selectedClassId, studentId: student.id }),
        })
      );
      await refreshDashboard(selectedClassId);
      show("success", "已剔除學生。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法剔除學生。");
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
    setScratchResults({});
  }

  function logoutTeacher() {
    localStorage.removeItem("scratch-teacher");
    localStorage.removeItem("scratch-classes");
    setTeacher(null);
    setClasses([]);
    setDashboard(emptyDashboard);
  }

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    localStorage.removeItem("scratch-admin");
    setAdmin(null);
    setAdminDashboard({ teachers: [], classes: [] });
  }

  const selected = chapters.find((chapter) => chapter.no === selectedChapter) ?? chapters[0];

  return (
    <main>
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">宜蘭縣國小程式設計自學</p>
          <h1>
            <button type="button" onClick={() => setMode("map")} aria-label="回到課程地圖">
              宜蘭 Scratch 基礎課程
            </button>
          </h1>
          <p className="hero__copy">
            12 堂射擊遊戲課程，學生在裝置上完成自我檢核，老師以自選雲端收件並掌握進度。
          </p>
          <div className="hero__actions">
            <button onClick={() => setMode("student")} className={mode === "student" ? "active" : ""}>
              學生入口
            </button>
            <button onClick={() => setMode("teacher")} className={mode === "teacher" ? "active" : ""}>
              老師後台
            </button>
            <button onClick={() => setMode("admin")} className={mode === "admin" ? "active" : ""}>
              超管後台
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
            <span>{student ? `${progressPercent}%` : "Drive"}</span>
            <small>{student ? "完成率" : "雲端繳交"}</small>
          </div>
        </div>
      </section>

      {notice && <div className={`notice notice--${notice.type}`}>{notice.text}</div>}

      <section className={`layout ${mode === "teacher" || mode === "admin" ? "layout--backend" : ""}`}>
        {mode !== "teacher" && mode !== "admin" && (
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
                    setMode(student ? "student" : "chapter");
                  }}
                >
                  <span>{String(chapter.no).padStart(2, "0")}</span>
                  <strong>{chapter.title}</strong>
                  <small>{earned ? "已得徽章" : chapter.range}</small>
                </button>
              );
            })}
          </aside>
        )}

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
                    analyses={scratchResults}
                    busy={busy}
                    submissionUrl={submissionUrlOf(studentClass)}
                    submissionLabel={submissionLabelOf(studentClass)}
                    onToggle={toggleCheck}
                    onSubmit={submitChapter}
                    onMarkUploaded={markExternalUploaded}
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
                  {teacher.status && teacher.status !== "active" ? (
                    <div className="approval-panel">
                      <span>{accountStatusLabel(teacher.status)}</span>
                      <h3>老師帳號正在等待啟用</h3>
                      <p>請聯絡超級管理者啟用帳號。啟用後重新登入，即可繼續管理班級。</p>
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
                            {item.name} - {item.code} - {accountStatusLabel(item.status)}
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

                  {dashboard.class?.status === "active" ? (
                    <>
                    <form
                      className="submission-settings"
                      key={selectedClassId}
                      onSubmit={saveSubmissionSettings}
                    >
                    <div>
                      <span>作品繳交設定</span>
                      <strong>由老師管理雲端原始檔</strong>
                    </div>
                    <label>
                      按鈕名稱
                      <input
                        name="submissionLabel"
                        defaultValue={submissionLabelOf(dashboard.class)}
                        placeholder="例如：繳交到五年甲班 Google 表單"
                      />
                    </label>
                    <label className="submission-url-field">
                      收件連結
                      <input
                        name="submissionUrl"
                        type="url"
                        defaultValue={submissionUrlOf(dashboard.class)}
                        placeholder="https://forms.google.com/..."
                      />
                    </label>
                    <button disabled={busy}>儲存繳交設定</button>
                    {submissionUrlOf(dashboard.class) && (
                      <a href={submissionUrlOf(dashboard.class)} target="_blank" rel="noreferrer">
                        開啟收件頁面
                      </a>
                    )}
                    </form>

                    <TeacherDashboard
                      dashboard={dashboard}
                      busy={busy}
                      onReview={reviewSubmission}
                    />

                    <TeacherRoster
                      students={dashboard.students}
                      busy={busy}
                      onSave={saveStudent}
                      onRemove={removeStudent}
                    />
                    </>
                  ) : (
                    <div className="approval-panel approval-panel--class">
                      <span>{accountStatusLabel(dashboard.class?.status)}</span>
                      <h3>這個班級尚未啟用</h3>
                      <p>班級代碼已產生，超管啟用後，學生才能加入，老師也才能編輯名冊。</p>
                    </div>
                  )}

                  <form className="pin-change" onSubmit={changeTeacherPin}>
                    <div>
                      <span>{teacher.mustChangePin ? "需要更換" : "帳號安全"}</span>
                      <strong>變更老師 PIN</strong>
                    </div>
                    <input name="currentPin" type="password" minLength={4} placeholder="目前或臨時 PIN" required />
                    <input name="newPin" type="password" minLength={4} placeholder="新 PIN" required />
                    <button disabled={busy}>更新 PIN</button>
                  </form>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {mode === "admin" && (
            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Super Admin</p>
                  <h2>超級管理後台</h2>
                </div>
                {admin && <button className="ghost" onClick={logoutAdmin}>登出</button>}
              </div>
              {!admin ? (
                <form className="admin-login" onSubmit={loginAdmin}>
                  <h3>超級管理者登入</h3>
                  <label>
                    Email
                    <input name="email" type="email" placeholder="admin@example.com" required />
                  </label>
                  <label>
                    PIN
                    <input name="pin" type="password" minLength={4} required />
                  </label>
                  <button disabled={busy}>進入管理後台</button>
                </form>
              ) : (
                <AdminConsole
                  dashboard={adminDashboard}
                  busy={busy}
                  onRefresh={() => refreshAdmin()}
                  onAction={runAdminAction}
                  onResetPin={resetTeacherPin}
                />
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

          {mode === "chapter" && (
            <article className={`surface chapter-preview chapter-preview--${selected.color}`}>
              <div className="chapter-preview__head">
                <div>
                  <p className="eyebrow">{selected.range}</p>
                  <h2>{selected.title}</h2>
                  <p>{selected.objective}</p>
                </div>
                <span>{selected.badge}</span>
              </div>

              <div className="chapter-preview__grid">
                <section>
                  <h3>學習目標</h3>
                  <ul>
                    {selected.lessonPoints.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </section>
                <section>
                  <h3>內容說明</h3>
                  <p>{selected.overview}</p>
                </section>
              </div>

              <section className="chapter-preview__video">
                <div>
                  <h3>本章影片</h3>
                  <p>{selected.videoTitles.join("、")}</p>
                </div>
                <div className="video-player-list">
                  {selected.videoIds.map((videoId, index) => (
                    <div className="video-player" key={videoId}>
                      <strong>{selected.videoTitles[index]}</strong>
                      <div className="video-frame">
                        <iframe
                          src={playlistEmbedUrl(videoId)}
                          title={selected.videoTitles[index]}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="chapter-preview__checks">
                <h3>自我檢核</h3>
                <div>
                  {selected.checks.map((check) => <span key={check.id}>{check.label}</span>)}
                </div>
              </section>

              <div className="chapter-preview__actions">
                <a href={`/chapters/${selected.no}`}>閱讀完整章節頁</a>
                <button onClick={() => setMode("student")}>學生登入與作品檢核</button>
              </div>
            </article>
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
  analyses,
  busy,
  submissionUrl,
  submissionLabel,
  onToggle,
  onSubmit,
  onMarkUploaded,
}: {
  chapter: (typeof chapters)[number];
  submission?: Submission;
  earned: boolean;
  checked: string[];
  analyses: Record<string, ScratchAnalysis>;
  busy: boolean;
  submissionUrl: string;
  submissionLabel: string;
  onToggle: (chapterNo: number, checkId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, chapterNo: number) => void;
  onMarkUploaded: (submissionId: string) => void;
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

      <div className="chapter-resources">
        <div className="video-list">
          {chapter.videoTitles.map((title) => (
            <span key={title}>{title}</span>
          ))}
        </div>
        <div className="chapter-tools">
          <a href={`/chapters/${chapter.no}`}>閱讀本章教材頁</a>
        </div>
      </div>

      <form className="submit-box" onSubmit={(event) => onSubmit(event, chapter.no)}>
        {chapter.submissionTasks ? (
          <div className="submission-tasks">
            {chapter.submissionTasks.map((task) => {
              const taskChecks = chapter.checks.filter((check) => task.checkIds.includes(check.id));
              const analysis = analyses[`${chapter.no}:${task.id}`];
              return (
                <section className="submission-task" key={task.id}>
                  <div className="submission-task__head">
                    <div>
                      <h4>{task.title}</h4>
                      <strong>{task.videoTitle}</strong>
                    </div>
                    <span>{analysis ? (analysis.passedIds.length === task.checkIds.length ? "檢核通過" : "需要修正") : "尚未檢核"}</span>
                  </div>
                  <p>{task.description}</p>
                  <AutomaticCheckList checks={taskChecks} analysis={analysis} />
                  <label className="file-field">
                    選擇這份 Scratch 作品
                    <input name={`file-${task.id}`} type="file" accept=".sb3" required />
                  </label>
                </section>
              );
            })}
          </div>
        ) : isAutomaticChapter(chapter.no) ? (
          <>
            <AutomaticCheckList checks={chapter.checks} analysis={analyses[`${chapter.no}:default`]} />
            <label className="file-field">
              選擇 Scratch 檔案進行檢核
              <input name="file" type="file" accept=".sb3" required />
              <small>檔案只在這台裝置上檢查，不會上傳到本網站。</small>
            </label>
          </>
        ) : (
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
        )}
        {chapter.no > 5 && (
          <label className="file-field">
            選擇 Scratch 檔案進行檢核
            <input name="file" type="file" accept=".sb3" required />
            <small>檔案只在這台裝置上檢查，不會上傳到本網站。</small>
          </label>
        )}
        {chapter.submissionTasks && <small className="local-check-note">兩份檔案只在這台裝置上檢查，不會上傳到本網站。</small>}
        <button disabled={busy}>{chapter.submissionTasks ? "檢核兩份作品" : isAutomaticChapter(chapter.no) ? "開始自動檢核" : "送出檢核"}</button>
      </form>

      {submission && submissionUrl && (submission.status === "ready_to_upload" || submission.status === "resubmit") && (
        <div className="external-submit">
          <div>
            <span>第二步</span>
            <strong>{chapter.submissionTasks ? "將兩份原始作品繳交給老師" : "將原始作品繳交給老師"}</strong>
            <p>上傳完成後，回到這裡通知老師。</p>
          </div>
          <a href={submissionUrl} target="_blank" rel="noreferrer">{submissionLabel}</a>
          <button type="button" disabled={busy} onClick={() => onMarkUploaded(submission.id)}>
            我已完成上傳
          </button>
        </div>
      )}

      {submission?.status === "uploaded" && (
        <div className="external-submit external-submit--waiting">
          <div>
            <span>已回報</span>
            <strong>等待老師確認作品</strong>
            <p>老師確認後，本章徽章會自動點亮。</p>
          </div>
        </div>
      )}

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

function AutomaticCheckList({
  checks,
  analysis,
}: {
  checks: { id: string; label: string }[];
  analysis?: ScratchAnalysis;
}) {
  return (
    <div className="check-list check-list--automatic" aria-live="polite">
      {checks.map((item) => {
        const check = analysis?.checks.find((candidate) => candidate.id === item.id);
        return (
          <div key={item.id} className={check?.passed ? "checked" : check ? "needs-fix" : ""}>
            <span className="check-result">{check ? (check.passed ? "通過" : "待修正") : "等待檢核"}</span>
            <span>
              <strong>{item.label}</strong>
              {check && <small>{check.detail}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function validateScratchFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || !value.name.toLowerCase().endsWith(".sb3")) {
    throw new Error("請選擇 Scratch .sb3 檔案。");
  }
  if (value.size <= 0 || value.size > 20 * 1024 * 1024) {
    throw new Error("每個檔案需小於 20MB。");
  }
  return value;
}

function isAutomaticChapter(chapterNo: number) {
  return chapterNo === 1 || chapterNo === 2 || chapterNo === 4 || chapterNo === 5;
}

function TeacherRoster({
  students,
  busy,
  onSave,
  onRemove,
}: {
  students: Student[];
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>, studentId?: string) => void;
  onRemove: (student: Student) => void;
}) {
  return (
    <section className="roster-manager">
      <div className="roster-manager__head">
        <div>
          <span>學生帳號</span>
          <h3>班級名冊管理</h3>
        </div>
        <b>{students.length} 人</b>
      </div>
      <form className="roster-add" onSubmit={(event) => onSave(event)}>
        <input name="seatNo" placeholder="座號" required />
        <input name="nickname" placeholder="暱稱" required />
        <input name="pin" type="password" minLength={4} placeholder="初始 PIN" required />
        <button disabled={busy}>新增學生</button>
      </form>
      <div className="roster-list">
        {students.length === 0 && <p>尚無學生，可由老師新增，或讓學生以班級代碼自行加入。</p>}
        {students.map((item) => (
          <form key={item.id} className="roster-row" onSubmit={(event) => onSave(event, item.id)}>
            <input name="seatNo" defaultValue={seatOf(item)} aria-label={`${item.nickname}座號`} required />
            <input name="nickname" defaultValue={item.nickname} aria-label="暱稱" required />
            <input name="pin" type="password" minLength={4} placeholder="設定新 PIN" aria-label="新 PIN" required />
            <button disabled={busy}>儲存</button>
            <button type="button" className="danger" disabled={busy} onClick={() => onRemove(item)}>剔除</button>
          </form>
        ))}
      </div>
    </section>
  );
}

function AdminConsole({
  dashboard,
  busy,
  onRefresh,
  onAction,
  onResetPin,
}: {
  dashboard: AdminDashboard;
  busy: boolean;
  onRefresh: () => void;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
  onResetPin: (event: FormEvent<HTMLFormElement>, teacherId: string) => void;
}) {
  const pendingTeachers = dashboard.teachers.filter((item) => item.role !== "superadmin" && item.status === "pending").length;
  const pendingClasses = dashboard.classes.filter((item) => item.status === "pending").length;
  return (
    <div className="admin-console">
      <div className="dashboard-summary admin-summary">
        <div><span>教師帳號</span><strong>{dashboard.teachers.filter((item) => item.role !== "superadmin").length}</strong></div>
        <div><span>待審教師</span><strong>{pendingTeachers}</strong></div>
        <div><span>待審班級</span><strong>{pendingClasses}</strong></div>
        <button className="ghost" disabled={busy} onClick={onRefresh}>更新資料</button>
      </div>

      <section className="admin-section">
        <h3>教師帳號</h3>
        <div className="admin-list">
          {dashboard.teachers.map((item) => (
            <article key={item.id} className="admin-item">
              <div>
                <span>{item.role === "superadmin" ? "超級管理者" : accountStatusLabel(item.status)}</span>
                <strong>{item.name}</strong>
                <small>{item.email}</small>
              </div>
              {item.role !== "superadmin" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => onAction(
                      { action: "teacher_status", teacherId: item.id, status: item.status === "active" ? "disabled" : "active" },
                      item.status === "active" ? "已停用教師帳號。" : "已啟用教師帳號。"
                    )}
                  >
                    {item.status === "active" ? "停用" : "啟用"}
                  </button>
                  <form onSubmit={(event) => onResetPin(event, item.id)}>
                    <input name="newPin" type="password" minLength={4} placeholder="臨時 PIN" required />
                    <button disabled={busy}>重設 PIN</button>
                  </form>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h3>所有班級與代碼</h3>
        <div className="admin-list">
          {dashboard.classes.map((item) => (
            <article key={item.id} className="admin-item admin-item--class">
              <div>
                <span>{accountStatusLabel(item.status)}</span>
                <strong>{item.name}</strong>
                <small>{item.teacher_name} · {item.teacher_email}</small>
              </div>
              <code>{item.code}</code>
              <b>{item.student_count ?? 0} 位學生</b>
              <button
                disabled={busy}
                onClick={() => onAction(
                  { action: "class_status", classId: item.id, status: item.status === "active" ? "disabled" : "active" },
                  item.status === "active" ? "已停用班級。" : "已啟用班級。"
                )}
              >
                {item.status === "active" ? "停用" : "啟用"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeacherDashboard({
  dashboard,
  busy,
  onReview,
}: {
  dashboard: Dashboard;
  busy: boolean;
  onReview: (submissionId: string, action: "confirm" | "resubmit") => void;
}) {
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
                        {earned ? (
                          "徽章"
                        ) : submission?.status === "uploaded" ? (
                          <div className="review-actions">
                            <span>待確認</span>
                            <button disabled={busy} onClick={() => onReview(submission.id, "confirm")}>
                              收到
                            </button>
                            <button className="ghost" disabled={busy} onClick={() => onReview(submission.id, "resubmit")}>
                              補交
                            </button>
                          </div>
                        ) : submission ? statusLabel(submission.status) : "-"}
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
