"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { chapters, playlistEmbedUrl, playlistUrl } from "./course-data";
import { analyzeScratchFile, type ScratchAnalysis, type ScratchTask } from "./scratch-analyzer";
import { authorizedFetch, firebaseAuth, signInWithGoogle, signOutFirebase } from "./firebase-client";
import { CourseLibrary } from "./library/CourseLibrary";
import { ILC_SCRATCH_LABEL, isIlcScratchPlatform } from "./submission-links";

export type AppMode = "library" | "student" | "teacher" | "admin" | "map" | "chapter";

type PortalRole = "superadmin" | "teacher" | "student" | "unknown";
type PortalIdentity = {
  role: PortalRole;
  name: string;
  email: string;
  status: string;
};

type Teacher = {
  id: string;
  name: string;
  email: string;
  role?: string;
  status?: string;
  mustChangePin?: boolean;
  must_change_pin?: number;
  schoolId?: string;
  schoolName?: string;
  schools?: SchoolInfo[];
};
type SchoolInfo = {
  id: string;
  name: string;
  division?: "E" | "J" | "unclassified";
  enabled?: number;
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
  enrollmentEnabled?: boolean;
  enrollment_enabled?: number;
  schoolId?: string;
  school_id?: string;
  school_name?: string;
  archived?: boolean | number;
  status?: string;
  createdAt?: string;
};
type Student = {
  id: string;
  classId?: string;
  class_id?: string;
  seatNo?: string;
  seat_no?: string;
  nickname: string;
  email?: string;
  status?: string;
};
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
  project_url?: string;
  projectUrl?: string;
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

type CourseAssignment = {
  id: string;
  title: string;
  status: string;
  assignment_enabled: number;
};

type CourseProjectSubmission = {
  id: string;
  class_course_id: string;
  student_id: string;
  project_url: string;
  course_title: string;
  updated_at?: string;
};

type Dashboard = {
  class: ClassInfo | null;
  students: Student[];
  submissions: Submission[];
  badges: Badge[];
  courses: CourseAssignment[];
  courseProjects: CourseProjectSubmission[];
};

type AdminClass = ClassInfo & {
  teacher_name?: string;
  teacher_email?: string;
  student_count?: number;
};

type AdminSchool = SchoolInfo & {
  domains_json: string;
  teacher_count?: number;
  class_count?: number;
  student_count?: number;
  created_at?: string;
  updated_at?: string;
};

type AdminUser = {
  id: string;
  user_type: "teacher" | "student";
  name: string;
  email?: string;
  role: string;
  status: string;
  school_name?: string;
  school_id?: string;
  school_ids?: string;
  school_source?: string;
  school_verified?: number;
  last_login_at?: string;
  last_active_at?: string;
  created_at?: string;
  class_name?: string;
  teacher_name?: string;
  seat_no?: string;
  class_count?: number;
  student_count?: number;
  solved_count?: number;
  passed_count?: number;
  badge_count?: number;
  last_solved_at?: string;
};

type AdminCourse = {
  id: string;
  title: string;
  summary: string;
  status: string;
  version_status: string;
  version_no: number;
  lesson_count: number;
  adoption_count: number;
  owner_name: string;
  owner_email: string;
  updated_at?: string;
};

type AdminActivity = {
  id: string;
  user_type: string;
  user_id: string;
  user_name?: string;
  action: string;
  detail_json?: string;
  created_at: string;
};

type TeacherCourseOption = { id: string; title: string; current_version_id: string };

type AdminDashboard = {
  teachers: Teacher[];
  students: AdminUser[];
  users: AdminUser[];
  classes: AdminClass[];
  schools: AdminSchool[];
  courses: AdminCourse[];
  permissions: Array<{ teacher_id: string; course_id: string; allowed: number }>;
  activity: AdminActivity[];
  fileStorage: { configured: boolean; provider?: string; mode?: string };
};

const emptyAdminDashboard: AdminDashboard = {
  teachers: [], students: [], users: [], classes: [], schools: [], courses: [], permissions: [], activity: [],
  fileStorage: { configured: false },
};

type NoticeType = "success" | "error" | "info";
type Notice = { type: NoticeType; text: string } | null;

const emptyDashboard: Dashboard = {
  class: null,
  students: [],
  submissions: [],
  badges: [],
  courses: [],
  courseProjects: [],
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
  return item?.submissionLabel ?? item?.submission_label ?? ILC_SCRATCH_LABEL;
}

function enrollmentEnabledOf(item?: ClassInfo | null) {
  return item?.enrollmentEnabled ?? Boolean(item?.enrollment_enabled ?? 1);
}

function classArchivedOf(item?: ClassInfo | null) {
  return Boolean(item?.archived);
}

function projectUrlOf(item?: Submission | null) {
  return item?.projectUrl ?? item?.project_url ?? "";
}

function projectUrlsOf(item?: Submission | null) {
  const value = projectUrlOf(item);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((url): url is string => typeof url === "string");
  } catch {
    // Older submissions stored one plain URL.
  }
  return [value];
}

function accountStatusLabel(status?: string) {
  if (status === "active") return "已啟用";
  if (status === "disabled") return "已停用";
  return "待審核";
}

function portalRoleLabel(role?: PortalRole) {
  if (role === "superadmin") return "超級管理者";
  if (role === "teacher") return "教師";
  if (role === "student") return "學生";
  return "未建立身分";
}

function initialMode(): AppMode {
  if (typeof window === "undefined") return "library";

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "library" || mode === "student" || mode === "teacher" || mode === "admin" || mode === "map" || mode === "chapter") return mode;
  return "library";
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

export function CourseApp({ initialModeValue }: { initialModeValue?: AppMode } = {}) {
  const [mode, setMode] = useState<AppMode>(() => initialModeValue ?? initialMode());
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(() => readStored("scratch-teacher"));
  const [admin, setAdmin] = useState<Teacher | null>(() => readStored("scratch-admin"));
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard>(emptyAdminDashboard);
  const [classes, setClasses] = useState<ClassInfo[]>(() => readStored("scratch-classes") ?? []);
  const [selectedClassId, setSelectedClassId] = useState(
    () => readStored<ClassInfo[]>("scratch-classes")?.[0]?.id ?? ""
  );
  const [teacherCourses, setTeacherCourses] = useState<TeacherCourseOption[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [teacherTab, setTeacherTab] = useState<"classes" | "students">("classes");
  const [student, setStudent] = useState<Student | null>(() => readStored("scratch-student"));
  const [studentClass, setStudentClass] = useState<ClassInfo | null>(() => readStored("scratch-student-class"));
  const [studentAccessMode, setStudentAccessMode] = useState<"login" | "join">("login");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [checked, setChecked] = useState<Record<number, string[]>>({});
  const [scratchResults, setScratchResults] = useState<Record<string, ScratchAnalysis>>({});
  const [selectedChapter, setSelectedChapter] = useState(initialChapter);
  const [identity, setIdentity] = useState<PortalIdentity | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);

  const loadIdentity = useCallback(async () => {
    const data = await readJson<{ identity: PortalIdentity }>(await authorizedFetch("/api/session"));
    setIdentity(data.identity);
    return data.identity;
  }, []);

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (!user) {
      setIdentity(null);
      setIdentityBusy(false);
      return;
    }
    setIdentityBusy(true);
    void loadIdentity().catch(() => setIdentity(null)).finally(() => setIdentityBusy(false));
  }), [loadIdentity]);

  useEffect(() => {
    if (!admin?.id) return;
    void authorizedFetch("/api/admin/dashboard").then((response) => readJson<AdminDashboard>(response)).then(setAdminDashboard).catch(() => undefined);
  }, [admin?.id]);

  useEffect(() => {
    if (teacher?.status !== "active") return;
    void authorizedFetch("/api/library").then((response) => readJson<{ courses: TeacherCourseOption[] }>(response)).then((data) => setTeacherCourses(data.courses)).catch(() => undefined);
  }, [teacher?.id, teacher?.status]);

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

  async function authenticatePortal() {
    setBusy(true);
    setIdentityBusy(true);
    try {
      if (!firebaseAuth.currentUser) await signInWithGoogle();
      const current = await loadIdentity();
      if (current.role === "unknown") {
        show("error", "這個 Google 帳號尚未加入班級或建立教師帳號。");
      } else {
        show("success", `已以${portalRoleLabel(current.role)}身分登入。`);
      }
      return current;
    } catch (error) {
      show("error", error instanceof Error ? error.message : "登入失敗。");
      return null;
    } finally {
      setBusy(false);
      setIdentityBusy(false);
    }
  }

  async function requirePortalRole(roles: PortalRole[], feature: string) {
    const current = identity ?? await authenticatePortal();
    if (!current) return null;
    if (!roles.includes(current.role)) {
      show("error", `目前是${portalRoleLabel(current.role)}身分，無法使用「${feature}」。`);
      return null;
    }
    return current;
  }

  async function openMyCourses() {
    if (await requirePortalRole(["student"], "我的課程")) window.location.assign("/learn");
  }

  async function openCourseStudio() {
    if (await requirePortalRole(["teacher", "superadmin"], "課程管理")) window.location.assign("/studio");
  }

  async function openTeacherDashboard() {
    if (!await requirePortalRole(["teacher", "superadmin"], "班級管理")) return;
    const user = firebaseAuth.currentUser;
    if (!user) return;
    setBusy(true);
    try {
      const data = await readJson<{ teacher: Teacher; classes: ClassInfo[] }>(
        await fetch("/api/teacher/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: await user.getIdToken() }),
        })
      );
      setTeacher(data.teacher);
      setClasses(data.classes);
      setSelectedClassId(data.classes[0]?.id ?? "");
      localStorage.setItem("scratch-teacher", JSON.stringify(data.teacher));
      localStorage.setItem("scratch-classes", JSON.stringify(data.classes));
      setMode("teacher");
      if (data.classes[0] && data.teacher.status === "active") {
        await refreshDashboard(data.classes[0].id, data.teacher.id);
      }
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法開啟班級管理。");
    } finally {
      setBusy(false);
    }
  }

  async function openAdminDashboard() {
    if (!await requirePortalRole(["superadmin"], "系統管理")) return;
    const user = firebaseAuth.currentUser;
    if (!user) return;
    setBusy(true);
    try {
      const data = await readJson<{ admin: Teacher }>(
        await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: await user.getIdToken() }),
        })
      );
      setAdmin(data.admin);
      localStorage.setItem("scratch-admin", JSON.stringify(data.admin));
      setMode("admin");
      await refreshAdmin(data.admin.id);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法開啟系統管理。");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStudent(activeStudentId = student?.id) {
    const studentId = activeStudentId ? `?studentId=${encodeURIComponent(activeStudentId)}` : "";
    const data = await readJson<{
      submissions: Submission[];
      badges: Badge[];
      class?: ClassInfo;
    }>(await authorizedFetch(`/api/student/progress${studentId}`));
    setSubmissions(data.submissions);
    setBadges(data.badges);
    if (data.class) setStudentClass(data.class);
  }

  async function refreshDashboard(classId: string, teacherId = teacher?.id) {
    if (!teacherId) return;
    const data = await readJson<Dashboard>(
      await authorizedFetch(
        `/api/teacher/dashboard?classId=${encodeURIComponent(classId)}`
      )
    );
    setDashboard(data);
  }

  async function refreshAdmin(adminId = admin?.id) {
    if (!adminId) return;
    const data = await readJson<AdminDashboard>(
      await authorizedFetch("/api/admin/dashboard")
    );
    setAdminDashboard(data);
  }

  async function joinStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const google = await signInWithGoogle();
      const data = await readJson<{ student: Student; class: ClassInfo }>(
        await fetch("/api/student/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classCode: form.get("classCode"),
            seatNo: form.get("seatNo"),
            nickname: form.get("nickname"),
            idToken: google.idToken,
          }),
        })
      );
      setStudent(data.student);
      setStudentClass(data.class);
      setIdentity({ role: "student", name: data.student.nickname, email: data.student.email || google.email, status: "active" });
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

  async function loginStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const google = await signInWithGoogle();
      const data = await readJson<{ student: Student; class: ClassInfo }>(
        await fetch("/api/student/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: google.idToken }),
        })
      );
      setStudent(data.student);
      setStudentClass(data.class);
      setIdentity({ role: "student", name: data.student.nickname, email: data.student.email || google.email, status: "active" });
      localStorage.setItem("scratch-student", JSON.stringify(data.student));
      localStorage.setItem("scratch-student-class", JSON.stringify(data.class));
      await refreshStudent(data.student.id);
      show("success", "登入成功，已載入你的課程進度。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "學生登入失敗。");
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
      const currentChapter = chapters.find((chapter) => chapter.no === chapterNo);
      const tasks = currentChapter?.submissionTasks ?? [];
      const files = tasks.length > 0
        ? tasks.map((task) => form.get(`file-${task.id}`))
        : [form.get("file")];
      const scratchFiles = files.map((file) => validateScratchFile(file));
      await Promise.all(scratchFiles.map(async (file) => {
        const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
          throw new Error("這個檔案不像有效的 Scratch 作品，請從 Scratch 重新儲存。");
        }
      }));
      let checklist = checked[chapterNo] ?? [];
      if (tasks.length > 0) {
        const results = await Promise.all(tasks.map((task, index) => (
          analyzeScratchFile(scratchFiles[index], chapterNo, task.id as ScratchTask)
        )));
        checklist = results.flatMap((analysis) => analysis.passedIds);
        setScratchResults((current) => ({
          ...current,
          ...Object.fromEntries(tasks.map((task, index) => [`${chapterNo}:${task.id}`, results[index]])),
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
        await authorizedFetch("/api/submissions", {
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
            ? isIlcScratchPlatform(submissionUrlOf(studentClass))
              ? "自我檢核通過，接著請貼上宜蘭 Scratch 作品連結。"
              : "自我檢核通過，接著請到老師指定的收件頁面繳交。"
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
        await authorizedFetch("/api/submissions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "mark_uploaded", submissionId }),
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

  async function submitProjectLink(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    if (!student) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await readJson<{ submissions: Submission[]; badges: Badge[] }>(
        await authorizedFetch("/api/submissions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "submit_project",
            submissionId,
            projectUrls: form.getAll("projectUrl"),
          }),
        })
      );
      setSubmissions(data.submissions);
      setBadges(data.badges);
      show("success", "作品連結已交給老師，確認後就會取得徽章。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法繳交作品連結。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCourseAssignment(adoptionId: string) {
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(await authorizedFetch("/api/library", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle_assignment", adoptionId }),
      }));
      await refreshDashboard(selectedClassId);
      show("success", "課程作業設定已更新。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法更新課程作業設定。");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSubmission(submissionId: string, action: "confirm" | "resubmit") {
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await authorizedFetch("/api/submissions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, submissionId }),
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
      const google = await signInWithGoogle();
      const data = await readJson<{ teacher: Teacher; classes: ClassInfo[] }>(
        await fetch("/api/teacher/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            idToken: google.idToken,
            className: form.get("className"),
          }),
        })
      );
      setTeacher(data.teacher);
      setClasses(data.classes);
      setIdentity({
        role: data.teacher.role === "superadmin" ? "superadmin" : "teacher",
        name: data.teacher.name,
        email: data.teacher.email,
        status: data.teacher.status || "pending",
      });
      setSelectedClassId(data.classes[0]?.id ?? "");
      setDashboard({
        class: data.classes[0] ?? null,
        students: [],
        submissions: [],
        badges: [],
        courses: [],
        courseProjects: [],
      });
      localStorage.setItem("scratch-teacher", JSON.stringify(data.teacher));
      localStorage.setItem("scratch-classes", JSON.stringify(data.classes));
      if (data.teacher.role === "superadmin") {
        const session = await readJson<{ admin: Teacher }>(
          await fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: google.idToken }),
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
    try {
      const google = await signInWithGoogle();
      const data = await readJson<{ teacher: Teacher; classes: ClassInfo[] }>(
        await fetch("/api/teacher/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: google.idToken }),
        })
      );
      setTeacher(data.teacher);
      setClasses(data.classes);
      setIdentity({
        role: data.teacher.role === "superadmin" ? "superadmin" : "teacher",
        name: data.teacher.name,
        email: data.teacher.email,
        status: data.teacher.status || "pending",
      });
      setSelectedClassId(data.classes[0]?.id ?? "");
      localStorage.setItem("scratch-teacher", JSON.stringify(data.teacher));
      localStorage.setItem("scratch-classes", JSON.stringify(data.classes));
      if (data.teacher.role === "superadmin") {
        const session = await readJson<{ admin: Teacher }>(
          await fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: google.idToken }),
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
        await authorizedFetch("/api/classes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), courseVersionId: form.get("courseVersionId"), schoolId: form.get("schoolId") }),
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
        courses: [],
        courseProjects: [],
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

  async function toggleClassEnrollment(item: ClassInfo) {
    if (!teacher) return;
    setBusy(true);
    try {
      const data = await readJson<{ class: ClassInfo }>(
        await authorizedFetch("/api/classes", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "toggle_enrollment", classId: item.id }),
        })
      );
      setClasses((current) => {
        const next = current.map((candidate) => candidate.id === data.class.id ? data.class : candidate);
        localStorage.setItem("scratch-classes", JSON.stringify(next));
        return next;
      });
      setDashboard((current) => current.class?.id === data.class.id ? { ...current, class: data.class } : current);
      show("success", enrollmentEnabledOf(data.class) ? "已開放學生加入班級。" : "已停止新學生加入，現有學生資料會保留。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法更新班級加入狀態。");
    } finally {
      setBusy(false);
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const google = await signInWithGoogle();
      const data = await readJson<{ admin: Teacher }>(
        await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: google.idToken }),
        })
      );
      setAdmin(data.admin);
      setIdentity({ role: "superadmin", name: data.admin.name, email: data.admin.email, status: "active" });
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
        await authorizedFetch("/api/admin/actions", {
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

  async function saveStudent(event: FormEvent<HTMLFormElement>, studentId?: string) {
    event.preventDefault();
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await readJson<{ ok: boolean }>(
        await authorizedFetch("/api/teacher/students", {
          method: studentId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId: selectedClassId,
            studentId,
            seatNo: form.get("seatNo"),
            nickname: form.get("nickname"),
            email: form.get("email"),
          }),
        })
      );
      await refreshDashboard(selectedClassId);
      if (!studentId) event.currentTarget.reset();
      show("success", studentId ? "學生資料已更新。" : "已新增學生。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法儲存學生資料。");
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(student: Student) {
    if (!teacher || !selectedClassId) return;
    if (!window.confirm(`確定將 ${seatOf(student)} 號 ${student.nickname} 移出班級？學習與徽章紀錄會保留，之後仍可恢復。`)) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await authorizedFetch("/api/teacher/students", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ classId: selectedClassId, studentId: student.id }),
        })
      );
      await refreshDashboard(selectedClassId);
      show("success", "已將學生移出班級，學習紀錄仍保留。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法移出學生。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudentStatus(student: Student) {
    if (!teacher || !selectedClassId) return;
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(
        await authorizedFetch("/api/teacher/students", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "toggle_status", classId: selectedClassId, studentId: student.id }),
        })
      );
      await refreshDashboard(selectedClassId);
      show("success", student.status !== "active" ? "已恢復學生帳號。" : "已停用學生帳號，學生將無法登入。");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "無法更新學生狀態。");
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

  async function logoutPortal() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    await signOutFirebase().catch(() => null);
    localStorage.removeItem("scratch-student");
    localStorage.removeItem("scratch-student-class");
    localStorage.removeItem("scratch-teacher");
    localStorage.removeItem("scratch-classes");
    localStorage.removeItem("scratch-admin");
    setStudent(null);
    setStudentClass(null);
    setSubmissions([]);
    setBadges([]);
    setScratchResults({});
    setTeacher(null);
    setClasses([]);
    setDashboard(emptyDashboard);
    setAdmin(null);
    setAdminDashboard(emptyAdminDashboard);
    setIdentity(null);
    setMode("library");
    show("info", "已登出帳號。");
  }

  function logoutStudent() {
    void logoutPortal();
  }

  function logoutTeacher() {
    void logoutPortal();
  }

  async function logoutAdmin() {
    await logoutPortal();
  }

  const selected = chapters.find((chapter) => chapter.no === selectedChapter) ?? chapters[0];

  return (
    <main>
      <section className="hero">
        <div className="hero__account">
          {identity ? (
            <>
              <div>
                <span>{portalRoleLabel(identity.role)}</span>
                <strong>{identity.name}</strong>
              </div>
              <button type="button" onClick={() => void logoutPortal()}>登出</button>
            </>
          ) : (
            <button type="button" disabled={identityBusy || busy} onClick={() => void authenticatePortal()}>
              {identityBusy ? "確認登入狀態…" : "Google 登入"}
            </button>
          )}
        </div>
        <div className="hero__content">
          <p className="eyebrow">宜蘭縣國小程式設計自學</p>
          <h1>
            <button
              type="button"
              onClick={() => setMode(identity?.role === "teacher" ? "map" : "library")}
              aria-label={identity?.role === "teacher" ? "回到課程地圖" : "回到公開課程庫"}
            >
              宜蘭 Scratch 基礎課程
            </button>
          </h1>
          <p className="hero__copy">
            12 堂射擊遊戲課程，學生在裝置上完成自我檢核，再以宜蘭 Scratch 作品連結繳交。
          </p>
          <div className="hero__actions">
            {identity?.role === "student" ? (
              <>
                <button onClick={() => void openMyCourses()}>我的課程</button>
                <button onClick={() => setMode("library")} className={mode === "library" ? "active" : ""}>公開課程庫</button>
                <button onClick={() => setMode("student")} className={mode === "student" ? "active" : ""}>加入班級</button>
              </>
            ) : identity?.role === "teacher" ? (
              <>
                <button onClick={() => setMode("library")} className={mode === "library" ? "active" : ""}>公開課程庫</button>
                <button onClick={() => void openCourseStudio()}>課程管理</button>
                <button onClick={() => void openTeacherDashboard()} className={mode === "teacher" ? "active" : ""}>我的班級</button>
                <button onClick={() => setMode("map")} className={mode === "map" ? "active" : ""}>課程地圖</button>
              </>
            ) : identity?.role === "superadmin" ? (
              <>
                <button onClick={() => setMode("library")} className={mode === "library" ? "active" : ""}>公開課程庫</button>
                <button onClick={() => void openCourseStudio()}>課程管理</button>
                <button onClick={() => void openAdminDashboard()} className={mode === "admin" ? "active" : ""}>系統管理</button>
              </>
            ) : (
              <>
                <button onClick={() => setMode("library")} className={mode === "library" ? "active" : ""}>公開課程庫</button>
                <button onClick={() => setMode("student")} className={mode === "student" ? "active" : ""}>加入班級</button>
              </>
            )}
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
            <span>{student ? `${progressPercent}%` : "ILC"}</span>
            <small>{student ? "完成率" : "作品繳交"}</small>
          </div>
        </div>
      </section>

      {notice && <div className={`notice notice--${notice.type}`}>{notice.text}</div>}

      <section className={`layout ${mode === "library" || mode === "teacher" || mode === "admin" ? "layout--backend" : ""}`}>
        {mode !== "library" && mode !== "teacher" && mode !== "admin" && (
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
                    if (mode !== "map") setMode(student ? "student" : "chapter");
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
          {mode === "library" && <CourseLibrary embedded />}

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
                <div className="student-access">
                  <div className="student-access__tabs" aria-label="學生登入方式">
                    <button
                      type="button"
                      className={studentAccessMode === "login" ? "active" : ""}
                      aria-pressed={studentAccessMode === "login"}
                      onClick={() => setStudentAccessMode("login")}
                    >
                      已加入學生登入
                    </button>
                    <button
                      type="button"
                      className={studentAccessMode === "join" ? "active" : ""}
                      aria-pressed={studentAccessMode === "join"}
                      onClick={() => setStudentAccessMode("join")}
                    >
                      第一次加入班級
                    </button>
                  </div>

                  {studentAccessMode === "login" ? (
                    <form className="form-grid student-login-form" onSubmit={loginStudent}>
                      <button disabled={busy}>使用 Google 登入課程</button>
                    </form>
                  ) : (
                    <form className="form-grid student-join-form" onSubmit={joinStudent}>
                      <label>
                        班級代碼
                        <input name="classCode" placeholder="YL-ABCDE" autoComplete="off" required />
                      </label>
                      <label>
                        座號
                        <input name="seatNo" placeholder="例如 08" autoComplete="off" required />
                      </label>
                      <label>
                        暱稱
                        <input name="nickname" placeholder="例如 小宜" autoComplete="nickname" required />
                      </label>
                      <button disabled={busy}>使用 Google 帳號加入班級</button>
                    </form>
                  )}
                  <p className="student-access__note">
                    登入帳號由 Firebase Authentication 保護，Email 會由 Google 帳號自動帶入。
                  </p>
                </div>
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
                    onSubmitProject={submitProjectLink}
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
                      班級名稱
                      <input name="className" placeholder="例如 五年甲班 Scratch" />
                    </label>
                    <button disabled={busy}>使用 Google 註冊並建立班級</button>
                  </form>

                  <form onSubmit={loginTeacher}>
                    <h3>老師登入</h3>
                    <button disabled={busy}>使用 Google 進入後台</button>
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
                      <div className="teacher-tabs" role="tablist" aria-label="我的班級管理">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={teacherTab === "classes"}
                          className={teacherTab === "classes" ? "active" : "ghost"}
                          onClick={() => setTeacherTab("classes")}
                        >
                          班級管理
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={teacherTab === "students"}
                          className={teacherTab === "students" ? "active" : "ghost"}
                          onClick={() => setTeacherTab("students")}
                        >
                          學生管理
                        </button>
                      </div>

                      {teacherTab === "classes" ? (
                        <>
                          <div className="teacher-tools">
                            <div>
                              <span>目前老師</span>
                              <strong>{teacher.name}</strong>
                            </div>
                            <form onSubmit={createClass}>
                              <input name="name" placeholder="新增班級名稱" required />
                              <select name="schoolId" defaultValue={teacher.schoolId ?? teacher.schools?.[0]?.id ?? ""} aria-label="班級學校" required>
                                <option value="" disabled>選擇學校</option>
                                {(teacher.schools ?? []).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                              </select>
                              <select name="courseVersionId" defaultValue="" aria-label="新班級課程">
                                <option value="">建立後再選課程</option>
                                {teacherCourses.map((course) => <option key={course.id} value={course.current_version_id}>{course.title}</option>)}
                              </select>
                              <button disabled={busy}>新增班級</button>
                            </form>
                            <a className="text-link" href="/library">選擇班級課程</a>
                          </div>

                          <ClassEnrollmentManager
                            classes={classes}
                            selectedClassId={selectedClassId}
                            busy={busy}
                            onSelect={(classId) => {
                              setSelectedClassId(classId);
                              void refreshDashboard(classId);
                            }}
                            onToggle={toggleClassEnrollment}
                          />

                          {dashboard.class?.status === "active" && !classArchivedOf(dashboard.class) ? (
                            <>
                              <CourseAssignmentSettings
                                courses={dashboard.courses}
                                busy={busy}
                                onToggle={toggleCourseAssignment}
                              />
                              <TeacherDashboard
                                dashboard={dashboard}
                                busy={busy}
                                onReview={reviewSubmission}
                              />
                            </>
                          ) : (
                            <ClassApprovalPanel classInfo={dashboard.class} />
                          )}
                        </>
                      ) : (
                        <>
                          <div className="student-manager-toolbar">
                            <label>
                              管理班級
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
                            <button className="ghost" disabled={busy || !selectedClassId} onClick={() => selectedClassId && refreshDashboard(selectedClassId)}>
                              更新名冊
                            </button>
                          </div>
                          {dashboard.class?.status === "active" && !classArchivedOf(dashboard.class) ? (
                            <TeacherRoster
                              students={dashboard.students}
                              busy={busy}
                              onSave={saveStudent}
                              onToggleStatus={toggleStudentStatus}
                              onRemove={removeStudent}
                            />
                          ) : (
                            <ClassApprovalPanel classInfo={dashboard.class} />
                          )}
                        </>
                      )}

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
                {admin && <div className="admin-heading-actions"><a className="text-link" href="/admin/storage">檔案儲存狀態</a><a className="text-link" href="/admin/courses">課程管理</a><button className="ghost" onClick={logoutAdmin}>登出</button></div>}
              </div>
              {!admin ? (
                <form className="admin-login" onSubmit={loginAdmin}>
                  <h3>超級管理者登入</h3>
                  <button disabled={busy}>使用 Google 進入管理後台</button>
                </form>
              ) : (
                <AdminConsole
                  dashboard={adminDashboard}
                  busy={busy}
                  onRefresh={() => refreshAdmin()}
                  onAction={runAdminAction}
                />
              )}
            </div>
          )}

          {mode === "map" && (
            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Course Map</p>
                  <h2>{`第 ${selected.no} 章課程地圖`}</h2>
                </div>
                <label className="chapter-map-selector">
                  選擇章節
                  <select value={selectedChapter} onChange={(event) => setSelectedChapter(Number(event.target.value))}>
                    {chapters.map((chapter) => <option key={chapter.no} value={chapter.no}>{chapter.no}. {chapter.title}</option>)}
                  </select>
                </label>
              </div>
              <article className={`chapter-map chapter-map--${selected.color}`}>
                <header>
                  <div><span>{selected.range}</span><h3>{selected.title}</h3><p>{selected.objective}</p></div>
                  <b>{selected.badge}</b>
                </header>
                <div className="chapter-map__path">
                  <section><span>01</span><strong>學習目標</strong><p>{selected.lessonPoints[0]}</p></section>
                  <section><span>02</span><strong>內容說明</strong><p>{selected.overview}</p></section>
                  <section><span>03</span><strong>章節影片</strong><p>{selected.videoTitles.join("、")}</p></section>
                  <section><span>04</span><strong>自我檢核</strong><p>{selected.checks.length} 項檢核，完成後取得徽章。</p></section>
                </div>
                <footer>
                  <a href={`/chapters/${selected.no}`}>開啟第 {selected.no} 章教材</a>
                  <a className="text-link" href={playlistUrl} target="_blank" rel="noreferrer">播放清單</a>
                </footer>
              </article>
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
  onSubmitProject,
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
  onSubmitProject: (event: FormEvent<HTMLFormElement>, submissionId: string) => void;
}) {
  const usesIlcScratch = isIlcScratchPlatform(submissionUrl);
  const submittedProjectUrls = projectUrlsOf(submission);

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
        {!isAutomaticChapter(chapter.no) && !chapter.submissionTasks && (
          <label className="file-field">
            選擇 Scratch 檔案進行檢核
            <input name="file" type="file" accept=".sb3" required />
            <small>檔案只在這台裝置上檢查，不會上傳到本網站。</small>
          </label>
        )}
        {chapter.submissionTasks && <small className="local-check-note">兩份檔案只在這台裝置上檢查，不會上傳到本網站。</small>}
        <button disabled={busy}>{chapter.submissionTasks ? "檢核兩份作品" : isAutomaticChapter(chapter.no) ? "開始自動檢核" : "送出檢核"}</button>
      </form>

      {submission && submissionUrl && usesIlcScratch && (submission.status === "ready_to_upload" || submission.status === "resubmit") && (
        <form className="external-submit project-link-submit" onSubmit={(event) => onSubmitProject(event, submission.id)}>
          <div>
            <span>第二步</span>
            <strong>貼上宜蘭 Scratch 作品連結</strong>
            <p>先在宜蘭 Scratch 儲存並分享作品，再複製專案頁網址。</p>
          </div>
          <div className="project-link-submit__fields">
            {(chapter.submissionTasks ?? [{ id: "default", title: "本章作品" }]).map((task, index) => (
              <label key={task.id}>
                {chapter.submissionTasks ? `${index + 1}. ${task.title}` : "作品網址"}
                <input
                  name="projectUrl"
                  type="url"
                  required
                  placeholder="https://s3.ilc.edu.tw/projects/356121701/"
                />
              </label>
            ))}
          </div>
          <div className="project-link-submit__actions">
            <a href={submissionUrl} target="_blank" rel="noreferrer">開啟宜蘭 Scratch</a>
            <button disabled={busy}>繳交作品連結</button>
          </div>
        </form>
      )}

      {submission && submissionUrl && !usesIlcScratch && (submission.status === "ready_to_upload" || submission.status === "resubmit") && (
        <div className="external-submit">
          <div>
            <span>第二步</span>
            <strong>{chapter.submissionTasks ? "將兩份原始作品繳交給老師" : "將原始作品繳交給老師"}</strong>
            <p>完成外部繳交後，回到這裡通知老師。</p>
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
          {submittedProjectUrls.map((url, index) => (
            <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
              查看已繳交作品{submittedProjectUrls.length > 1 ? ` ${index + 1}` : ""}
            </a>
          ))}
        </div>
      )}

      {submission && (
        <div className="latest">
          <span>最近檢核</span>
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
  return chapterNo >= 1 && chapterNo <= 11 && chapterNo !== 3 && chapterNo !== 10;
}

function ClassApprovalPanel({ classInfo }: { classInfo?: ClassInfo | null }) {
  const archived = classArchivedOf(classInfo);
  return (
    <div className="approval-panel approval-panel--class">
      <span>{classInfo ? (archived ? "已封存" : accountStatusLabel(classInfo.status)) : "尚未選擇"}</span>
      <h3>{classInfo ? (archived ? "這個班級已封存" : "這個班級尚未啟用") : "尚未建立班級"}</h3>
      <p>
        {classInfo
          ? archived
            ? "封存班級保留學生、作業與進度紀錄，但不再接受加入或變更名冊。"
            : "班級代碼已產生，超管啟用後，老師才能開放學生加入並管理名冊。"
          : "請先在班級管理新增班級。"}
      </p>
    </div>
  );
}

function ClassEnrollmentManager({
  classes,
  selectedClassId,
  busy,
  onSelect,
  onToggle,
}: {
  classes: ClassInfo[];
  selectedClassId: string;
  busy: boolean;
  onSelect: (classId: string) => void;
  onToggle: (item: ClassInfo) => void;
}) {
  return (
    <section className="class-manager">
      <div className="class-manager__head">
        <div>
          <span>班級管理</span>
          <h3>選擇班級與開放加入</h3>
        </div>
        <b>{classes.length} 個班級</b>
      </div>
      <div className="class-manager__list">
        {classes.length === 0 && <p>尚未建立班級。</p>}
        {classes.map((item) => {
          const archived = classArchivedOf(item);
          const canManage = item.status === "active" && !archived;
          const accepting = enrollmentEnabledOf(item);
          return (
            <article key={item.id} className={item.id === selectedClassId ? "selected" : ""}>
              <button type="button" className="class-manager__select" onClick={() => onSelect(item.id)}>
                <span>{archived ? "已封存" : accountStatusLabel(item.status)}{item.school_name ? ` · ${item.school_name}` : ""}</span>
                <strong>{item.name}</strong>
                <code>{item.code}</code>
              </button>
              <label className="enrollment-toggle" aria-label={`${item.name}加入狀態`}>
                <input
                  type="checkbox"
                  checked={canManage && accepting}
                  disabled={busy || !canManage}
                  onChange={() => onToggle(item)}
                />
                <span>
                  <b>{canManage ? (accepting ? "開放加入" : "停止加入") : archived ? "班級已封存" : accountStatusLabel(item.status)}</b>
                  <small>{canManage ? (accepting ? "新學生可以使用班級代碼加入" : "現有學生與進度仍會保留") : archived ? "保留學生與學習紀錄" : "需由超管啟用班級"}</small>
                </span>
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CourseAssignmentSettings({
  courses,
  busy,
  onToggle,
}: {
  courses: CourseAssignment[];
  busy: boolean;
  onToggle: (adoptionId: string) => void;
}) {
  return (
    <section className="course-assignment-settings">
      <div>
        <span>課程作業</span>
        <h3>開放學生繳交作品網址</h3>
      </div>
      {courses.length === 0 ? (
        <p>這個班級尚未採用課程，請先到公開課程庫選擇課程。</p>
      ) : (
        <div className="course-assignment-list">
          {courses.map((course) => (
            <label key={course.id}>
              <span>
                <strong>{course.title}</strong>
                <small>{course.status === "active" ? "課程已開放" : "課程已關閉"}</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(course.assignment_enabled)}
                disabled={busy || course.status !== "active"}
                onChange={() => onToggle(course.id)}
              />
              <b>{course.assignment_enabled ? "收作業中" : "未收作業"}</b>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function TeacherRoster({
  students,
  busy,
  onSave,
  onToggleStatus,
  onRemove,
}: {
  students: Student[];
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>, studentId?: string) => void;
  onToggleStatus: (student: Student) => void;
  onRemove: (student: Student) => void;
}) {
  const activeCount = students.filter((student) => student.status === "active" || !student.status).length;
  return (
    <section className="roster-manager">
      <div className="roster-manager__head">
        <div>
          <span>學生帳號</span>
          <h3>班級名冊管理</h3>
        </div>
        <b>{activeCount} 人啟用／共 {students.length} 人</b>
      </div>
      <form className="roster-add" onSubmit={(event) => onSave(event)}>
        <input name="seatNo" placeholder="座號" required />
        <input name="nickname" placeholder="暱稱" required />
        <input name="email" type="email" placeholder="學生 Email" required />
        <button disabled={busy}>新增學生</button>
      </form>
      <div className="roster-list">
        {students.length === 0 && <p>尚無學生，可由老師新增，或讓學生以班級代碼自行加入。</p>}
        {students.map((item) => (
          <form key={item.id} className={`roster-row ${item.status !== "active" && item.status ? "roster-row--disabled" : ""}`} onSubmit={(event) => onSave(event, item.id)}>
            <input name="seatNo" defaultValue={seatOf(item)} aria-label={`${item.nickname}座號`} required />
            <input name="nickname" defaultValue={item.nickname} aria-label="暱稱" required />
            <input name="email" type="email" defaultValue={item.email ?? ""} placeholder="學生 Email" aria-label="學生 Email" readOnly required />
            <label className="student-status-toggle">
              <input
                type="checkbox"
                checked={item.status === "active" || !item.status}
                disabled={busy}
                onChange={() => onToggleStatus(item)}
              />
              <span>{item.status === "removed" ? "已移除" : item.status === "disabled" ? "已停用" : "已啟用"}</span>
            </label>
            <button disabled={busy}>儲存</button>
            <button type="button" className="danger" disabled={busy || item.status === "removed"} onClick={() => onRemove(item)}>移出班級</button>
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
}: {
  dashboard: AdminDashboard;
  busy: boolean;
  onRefresh: () => void;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"users" | "schools" | "classes" | "courses" | "activity">("users");
  const [query, setQuery] = useState("");
  const [userKind, setUserKind] = useState<"all" | "teacher" | "student">("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const pendingTeachers = dashboard.teachers.filter((item) => item.role !== "superadmin" && item.status === "pending").length;
  const pendingClasses = dashboard.classes.filter((item) => item.status === "pending").length;
  const publishedCourses = dashboard.courses.filter((item) => item.status === "published");
  const activeSchools = dashboard.schools.filter((item) => Boolean(item.enabled));
  const visibleUsers = dashboard.users.filter((item) => {
    const haystack = `${item.name} ${item.email ?? ""} ${item.school_name ?? ""} ${item.class_name ?? ""}`.toLowerCase();
    const schoolIds = new Set([item.school_id, ...(item.school_ids ?? "").split(",")].filter(Boolean));
    return (userKind === "all" || item.user_type === userKind)
      && (schoolFilter === "all" || schoolIds.has(schoolFilter))
      && haystack.includes(query.trim().toLowerCase());
  });
  function prettyDate(value?: string) {
    if (!value) return "尚無紀錄";
    const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
  }
  function activityLabel(action: string) {
    return ({ login: "登入系統", register: "註冊帳號", join_class: "加入班級", question_attempt: "完成課程題目", chapter_attempt: "完成章節檢核", course_project_submitted: "繳交課程作品", user_profile: "調整使用者資料", course_permission: "調整課程權限", teacher_status: "調整教師狀態", class_status: "調整班級狀態", class_profile: "更新班級設定", class_create: "建立班級", school_upsert: "新增或更新學校", school_status: "調整學校狀態", class_enrollment: "調整班級加入", student_added: "新增班級成員", student_profile: "更新學生資料", student_status: "調整學生狀態", student_removed: "移除班級成員" } as Record<string, string>)[action] ?? action;
  }
  function domainsText(value: string) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.join(", ") : "";
    } catch {
      return "";
    }
  }
  return (
    <div className="admin-console">
      <div className="dashboard-summary admin-summary">
        <div><span>全部使用者</span><strong>{dashboard.users.length}</strong></div>
        <div><span>待啟用帳號／班級</span><strong>{pendingTeachers + pendingClasses}</strong></div>
        <div><span>啟用學校</span><strong>{activeSchools.length}</strong></div>
        <div><span>已發布課程</span><strong>{publishedCourses.length}</strong></div>
        <button className="ghost" disabled={busy} onClick={onRefresh}>更新資料</button>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="後台管理區">
        <button className={tab === "users" ? "active" : "ghost"} onClick={() => setTab("users")}>使用者管理</button>
        <button className={tab === "schools" ? "active" : "ghost"} onClick={() => setTab("schools")}>學校管理</button>
        <button className={tab === "classes" ? "active" : "ghost"} onClick={() => setTab("classes")}>班級管理</button>
        <button className={tab === "courses" ? "active" : "ghost"} onClick={() => setTab("courses")}>課程管理</button>
        <button className={tab === "activity" ? "active" : "ghost"} onClick={() => setTab("activity")}>使用紀錄</button>
      </div>

      {tab === "users" &&
        <section className="admin-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Accounts</p><h3>使用者管理</h3></div>
            <div className="admin-filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋姓名、Email、學校或班級" aria-label="搜尋使用者" />
              <select value={userKind} onChange={(event) => setUserKind(event.target.value as typeof userKind)} aria-label="使用者身分">
                <option value="all">全部身分</option><option value="teacher">教師與超管</option><option value="student">學生</option>
              </select>
              <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} aria-label="篩選學校">
                <option value="all">全部學校</option>
                {dashboard.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </div>
          </div>
          <div className="admin-user-list">
            {visibleUsers.map((item) => {
              const permissions = new Map(dashboard.permissions.filter((permission) => permission.teacher_id === item.id).map((permission) => [permission.course_id, Boolean(permission.allowed)]));
              const assignedSchoolIds = (item.school_ids || item.school_id || "").split(",").filter(Boolean);
              return <article key={`${item.user_type}:${item.id}`} className="admin-user-card">
                <div className="admin-user-identity">
                  <span>{item.role === "superadmin" ? "超級管理者" : item.user_type === "teacher" ? "教師" : "學生"}</span>
                  <strong>{item.name}</strong>
                  <small>{item.email || "未綁定 Email"}</small>
                  {item.user_type === "student" && <small>{item.class_name} · {item.seat_no} 號 · 指導教師 {item.teacher_name}</small>}
                </div>
                <div className="admin-user-metrics">
                  <span>最後登入<b>{prettyDate(item.last_login_at)}</b></span>
                  <span>最近上線<b>{prettyDate(item.last_active_at)}</b></span>
                  {item.user_type === "student" ? <>
                    <span>解題狀況<b>{item.passed_count ?? 0}/{item.solved_count ?? 0} 通過</b></span>
                    <span>徽章<b>{item.badge_count ?? 0} 枚</b></span>
                  </> : <>
                    <span>班級<b>{item.class_count ?? 0} 班</b></span>
                    <span>學生<b>{item.student_count ?? 0} 人</b></span>
                  </>}
                </div>
                <form className="admin-user-form" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void onAction({ action: "user_profile", userType: item.user_type, userId: item.id, schoolId: form.get("schoolId"), schoolIds: form.getAll("schoolIds"), role: form.get("role"), status: form.get("status") }, "使用者資料已更新。");
                }}>
                  {item.user_type === "teacher" ? <TeacherSchoolPicker
                    key={`${item.id}:${assignedSchoolIds.join(",")}`}
                    schools={dashboard.schools}
                    assignedIds={assignedSchoolIds}
                  /> : <label>學校<select name="schoolId" defaultValue={item.school_id ?? ""}><option value="">未指定</option>{dashboard.schools.map((school) => <option key={school.id} value={school.id} disabled={!school.enabled && school.id !== item.school_id}>{school.name}{school.enabled ? "" : "（停用）"}</option>)}</select></label>}
                  <label>系統身分<select name="role" defaultValue={item.role}>
                    {item.user_type === "student" ? <option value="student">學生</option> : <><option value="teacher">教師</option><option value="superadmin">超級管理者</option></>}
                  </select></label>
                  <label>帳號狀態<select name="status" defaultValue={item.status}>
                    {item.user_type === "teacher" && <option value="pending">待啟用</option>}
                    <option value="active">啟用</option><option value="disabled">停用</option>
                    {item.user_type === "student" && <option value="removed">已移出班級</option>}
                  </select></label>
                  <button disabled={busy}>儲存</button>
                </form>
                {item.user_type === "teacher" && item.role !== "superadmin" && publishedCourses.length > 0 && <details className="admin-permissions">
                  <summary>課程使用權限</summary>
                  <div>{publishedCourses.map((course) => {
                    const allowed = permissions.get(course.id) ?? true;
                    return <label key={course.id}><input type="checkbox" checked={allowed} disabled={busy} onChange={(event) => void onAction({ action: "course_permission", teacherId: item.id, courseId: course.id, allowed: event.target.checked }, event.target.checked ? "已開放課程。" : "已停用這位教師的課程權限。")}/><span>{course.title}</span></label>;
                  })}</div>
                </details>}
              </article>;
            })}
            {visibleUsers.length === 0 && <p className="admin-empty">找不到符合條件的使用者。</p>}
          </div>
        </section>}

      {tab === "schools" && <section className="admin-section">
        <div className="admin-section-heading"><div><p className="eyebrow">Schools</p><h3>學校管理</h3></div></div>
        <form className="admin-school-form admin-school-form--new" onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void onAction({ action: "school_upsert", name: form.get("name"), domains: form.get("domains"), division: form.get("division"), enabled: true }, "學校已新增。");
        }}>
          <label>學校名稱<input name="name" placeholder="例如：宜蘭縣○○國小" required /></label>
          <label>Email 網域<input name="domains" placeholder="tmail.ilc.edu.tw, smail.ilc.edu.tw" /></label>
          <label>學制<select name="division" defaultValue="unclassified"><option value="E">國小</option><option value="J">國中</option><option value="unclassified">未分類</option></select></label>
          <button disabled={busy}>新增學校</button>
        </form>
        <div className="admin-school-list">{dashboard.schools.map((school) => <form key={school.id} className="admin-school-card" onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void onAction({ action: "school_upsert", schoolId: school.id, name: form.get("name"), domains: form.get("domains"), division: form.get("division"), enabled: form.get("enabled") === "on" }, "學校資料已更新。");
        }}>
          <div className="admin-school-card__summary"><span>{school.enabled ? "使用中" : "已停用"}</span><strong>{school.name}</strong><small>{school.teacher_count ?? 0} 位教師 · {school.class_count ?? 0} 個班級 · {school.student_count ?? 0} 位學生</small></div>
          <label>學校名稱<input name="name" defaultValue={school.name} required /></label>
          <label>Email 網域<input name="domains" defaultValue={domainsText(school.domains_json)} /></label>
          <label>學制<select name="division" defaultValue={school.division ?? "unclassified"}><option value="E">國小</option><option value="J">國中</option><option value="unclassified">未分類</option></select></label>
          <label className="admin-inline-check"><input type="checkbox" name="enabled" defaultChecked={Boolean(school.enabled)} />可供選取</label>
          <button disabled={busy}>儲存</button>
        </form>)}</div>
      </section>}

      {tab === "classes" && <section className="admin-section">
        <div className="admin-section-heading"><div><p className="eyebrow">Classes</p><h3>班級管理</h3></div></div>
        <div className="admin-class-list">{dashboard.classes.map((item) => <form key={item.id} className={`admin-class-card ${classArchivedOf(item) ? "is-archived" : ""}`} onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void onAction({ action: "class_profile", classId: item.id, schoolId: form.get("schoolId"), status: form.get("status"), enrollmentEnabled: form.get("enrollmentEnabled") === "on", archived: form.get("archived") === "on" }, "班級設定已更新。");
        }}>
          <div><span>{classArchivedOf(item) ? "已封存" : accountStatusLabel(item.status)}</span><strong>{item.name}</strong><small>{item.teacher_name} · {item.teacher_email}</small></div>
          <code>{item.code}</code><b>{item.student_count ?? 0} 位學生</b>
          <label>學校<select name="schoolId" defaultValue={item.school_id ?? ""} required><option value="" disabled>選擇學校</option>{dashboard.schools.map((school) => <option key={school.id} value={school.id} disabled={!school.enabled && school.id !== item.school_id}>{school.name}{school.enabled ? "" : "（停用）"}</option>)}</select></label>
          <label>審核狀態<select name="status" defaultValue={item.status}><option value="pending">待審核</option><option value="active">啟用</option><option value="disabled">停用</option></select></label>
          <label className="admin-inline-check"><input type="checkbox" name="enrollmentEnabled" defaultChecked={enrollmentEnabledOf(item)} />開放加入</label>
          <label className="admin-inline-check"><input type="checkbox" name="archived" defaultChecked={classArchivedOf(item)} />封存班級</label>
          <button disabled={busy}>儲存</button>
        </form>)}</div>
      </section>}

      {tab === "courses" && <section className="admin-section admin-course-manager">
        <div className="admin-section-heading">
          <div><p className="eyebrow">Course packages</p><h3>課程管理</h3></div>
          <div className="admin-course-actions"><a className="primary-link" href="/studio?source=admin">新增／匯入課程包</a><a className="text-link" href="/admin/courses">審核待發布課程</a></div>
        </div>
        <p className="admin-section-note">發布後的課程會出現在老師的公開課程庫；可在使用者管理中決定各教師能否採用。</p>
        <div className="admin-course-list">
          {dashboard.courses.map((course) => <article key={course.id}>
            <div><span>{course.status === "published" ? "已發布" : course.version_status === "review" ? "待審核" : "草稿"}</span><h4>{course.title}</h4><p>{course.summary || "尚未填寫課程摘要。"}</p></div>
            <dl><div><dt>版本</dt><dd>v{course.version_no}</dd></div><div><dt>章節</dt><dd>{course.lesson_count} 堂</dd></div><div><dt>採用</dt><dd>{course.adoption_count} 班</dd></div></dl>
            <small>{course.owner_name} · {prettyDate(course.updated_at)}</small>
          </article>)}
          {dashboard.courses.length === 0 && <p className="admin-empty">尚未建立課程包。</p>}
        </div>
      </section>}

      {tab === "activity" && <section className="admin-section">
        <div className="admin-section-heading"><div><p className="eyebrow">Audit log</p><h3>使用紀錄</h3></div></div>
        <div className="admin-activity-list">{dashboard.activity.map((item) => <div key={item.id}><span>{item.user_name || "未知使用者"}</span><strong>{activityLabel(item.action)}</strong><time>{prettyDate(item.created_at)}</time></div>)}{dashboard.activity.length === 0 && <p>尚無使用紀錄。</p>}</div>
      </section>}
    </div>
  );
}

function TeacherSchoolPicker({ schools, assignedIds }: { schools: AdminSchool[]; assignedIds: string[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(assignedIds));
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  const selectedNames = schools.filter((school) => selected.has(school.id)).map((school) => school.name);
  const summary = selectedNames.length === 0
    ? "尚未指定"
    : `${selectedNames.slice(0, 3).join("、")}${selectedNames.length > 3 ? `，另 ${selectedNames.length - 3} 所` : ""}`;
  const groups = [
    { division: "E", label: "國小" },
    { division: "J", label: "國中" },
    { division: "unclassified", label: "其他" },
  ];
  const visibleCount = schools.filter((school) => !normalizedQuery || school.name.toLocaleLowerCase("zh-TW").includes(normalizedQuery)).length;

  function toggleSchool(schoolId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(schoolId);
      else next.delete(schoolId);
      return next;
    });
  }

  return <details className="admin-school-picker">
    <summary>
      <span className="admin-school-picker__title">任教學校</span>
      <span className="admin-school-picker__summary">{summary}</span>
      <span className="admin-school-picker__count">{selected.size} 所</span>
    </summary>
    <div className="admin-school-picker__panel">
      <label className="admin-school-picker__search">
        <span>搜尋學校</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入校名快速篩選" />
      </label>
      {schools.length === 0 && <p className="admin-school-picker__empty">請先到「學校管理」建立學校。</p>}
      {schools.length > 0 && visibleCount === 0 && <p className="admin-school-picker__empty">找不到符合「{query.trim()}」的學校。</p>}
      <div className="admin-school-picker__groups">
        {groups.map((group) => {
          const groupSchools = schools.filter((school) => (school.division ?? "unclassified") === group.division);
          if (groupSchools.length === 0) return null;
          return <fieldset key={group.division} className="admin-school-group">
            <legend>{group.label}<span>{groupSchools.filter((school) => selected.has(school.id)).length}/{groupSchools.length}</span></legend>
            <div>
              {groupSchools.map((school) => {
                const matches = !normalizedQuery || school.name.toLocaleLowerCase("zh-TW").includes(normalizedQuery);
                const checked = selected.has(school.id);
                return <label key={school.id} className="admin-school-option" hidden={!matches}>
                  <input
                    type="checkbox"
                    name="schoolIds"
                    value={school.id}
                    checked={checked}
                    disabled={!school.enabled && !checked}
                    onChange={(event) => toggleSchool(school.id, event.target.checked)}
                  />
                  <span>{school.name}{school.enabled ? "" : "（停用）"}</span>
                </label>;
              })}
            </div>
          </fieldset>;
        })}
      </div>
    </div>
  </details>;
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
  const enabledAssignments = dashboard.courses.filter((course) => Boolean(course.assignment_enabled));
  const courseProjectsByStudent = new Map<string, CourseProjectSubmission[]>();
  for (const project of dashboard.courseProjects) {
    const items = courseProjectsByStudent.get(project.student_id) ?? [];
    items.push(project);
    courseProjectsByStudent.set(project.student_id, items);
  }

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
              <th>作業</th>
              {chapters.map((chapter) => (
                <th key={chapter.no}>{chapter.no}</th>
              ))}
              <th>徽章</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.students.length === 0 && (
              <tr>
                <td colSpan={15}>學生加入班級後，進度會出現在這裡。</td>
              </tr>
            )}
            {dashboard.students.map((student) => {
              const total = dashboard.badges.filter((badge) => studentIdOf(badge) === student.id).length;
              return (
                <tr key={student.id}>
                  <td>
                    <strong>{seatOf(student)} 號</strong>
                    <span>{student.nickname}{student.status === "disabled" ? "（已停用）" : ""}</span>
                  </td>
                  <td className="course-project-cell">
                    {(courseProjectsByStudent.get(student.id) ?? []).map((project) => (
                      <a key={project.id} href={project.project_url} target="_blank" rel="noreferrer">
                        {project.course_title}
                      </a>
                    ))}
                    {enabledAssignments.length > 0 && !courseProjectsByStudent.has(student.id) && <span>尚未繳交</span>}
                    {enabledAssignments.length === 0 && <span>-</span>}
                  </td>
                  {chapters.map((chapter) => {
                    const key = `${student.id}:${chapter.no}`;
                    const submission = submissionsByStudentChapter.get(key);
                    const earned = badgeSet.has(key);
                    return (
                      <td key={chapter.no} className={earned ? "cell-pass" : submission ? "cell-wait" : ""}>
                        {earned ? (
                          <div className="review-actions">
                            <span>徽章</span>
                            {projectUrlsOf(submission).map((url, index, urls) => (
                              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
                                作品{urls.length > 1 ? index + 1 : ""}
                              </a>
                            ))}
                          </div>
                        ) : submission?.status === "uploaded" ? (
                          <div className="review-actions">
                            <span>待確認</span>
                            {projectUrlsOf(submission).map((url, index, urls) => (
                              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
                                開啟作品{urls.length > 1 ? index + 1 : ""}
                              </a>
                            ))}
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
