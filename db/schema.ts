import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  firebaseUid: text("firebase_uid"),
  pinHash: text("pin_hash").notNull(),
  role: text("role").notNull().default("teacher"),
  status: text("status").notNull().default("pending"),
  mustChangePin: integer("must_change_pin").notNull().default(0),
  schoolName: text("school_name").notNull().default(""),
  lastLoginAt: text("last_login_at"),
  lastActiveAt: text("last_active_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("teachers_email_idx").on(table.email),
  uniqueIndex("teachers_firebase_uid_idx").on(table.firebaseUid),
]);

export const classes = sqliteTable("classes", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  submissionUrl: text("submission_url").notNull().default(""),
  submissionLabel: text("submission_label").notNull().default("宜蘭 Scratch 作品"),
  status: text("status").notNull().default("pending"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("classes_code_idx").on(table.code),
]);

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id),
  seatNo: text("seat_no").notNull(),
  nickname: text("nickname").notNull(),
  email: text("email"),
  firebaseUid: text("firebase_uid"),
  pinHash: text("pin_hash").notNull(),
  schoolName: text("school_name").notNull().default(""),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  lastActiveAt: text("last_active_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("students_class_seat_idx").on(table.classId, table.seatNo),
  index("students_email_idx").on(table.email),
  index("students_firebase_uid_idx").on(table.firebaseUid),
]);

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  ownerTeacherId: text("owner_teacher_id").notNull().references(() => teachers.id),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  schoolYear: text("school_year").notNull().default(""),
  region: text("region").notNull().default(""),
  educationStage: text("education_stage").notNull().default(""),
  tagsJson: text("tags_json").notNull().default("[]"),
  status: text("status").notNull().default("draft"),
  currentVersionId: text("current_version_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const courseVersions = sqliteTable("course_versions", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id),
  versionNo: integer("version_no").notNull(),
  status: text("status").notNull().default("draft"),
  changelog: text("changelog").notNull().default(""),
  previewConfirmed: integer("preview_confirmed").notNull().default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("course_versions_number_idx").on(table.courseId, table.versionNo),
]);

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  courseVersionId: text("course_version_id").notNull().references(() => courseVersions.id),
  title: text("title").notNull(),
  objective: text("objective").notNull().default(""),
  description: text("description").notNull().default(""),
  badgeName: text("badge_name").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const fileAssets = sqliteTable("file_assets", {
  id: text("id").primaryKey(),
  ownerTeacherId: text("owner_teacher_id").notNull().references(() => teachers.id),
  r2Key: text("r2_key").notNull(),
  storageProvider: text("storage_provider").notNull().default("cloudflare_kv"),
  providerFileId: text("provider_file_id"),
  sha256: text("sha256").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/x.scratch.sb3"),
  fileSize: integer("file_size").notNull(),
  purpose: text("purpose").notNull().default("reference"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("file_assets_owner_hash_idx").on(table.ownerTeacherId, table.sha256),
]);

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => lessons.id),
  title: text("title").notNull(),
  prompt: text("prompt").notNull().default(""),
  difficulty: text("difficulty").notNull().default("beginner"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(20),
  sortOrder: integer("sort_order").notNull().default(0),
  required: integer("required").notNull().default(1),
  referenceAssetId: text("reference_asset_id").references(() => fileAssets.id),
  analysisJson: text("analysis_json").notNull().default("{}"),
});

export const rubricRules = sqliteTable("rubric_rules", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => questions.id),
  label: text("label").notNull(),
  mode: text("mode").notNull().default("automatic"),
  scope: text("scope").notNull().default("any_sprite"),
  type: text("type").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  required: integer("required").notNull().default(1),
  weight: integer("weight").notNull().default(0),
  passFeedback: text("pass_feedback").notNull().default(""),
  failFeedback: text("fail_feedback").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const courseReviews = sqliteTable("course_reviews", {
  id: text("id").primaryKey(),
  courseVersionId: text("course_version_id").notNull().references(() => courseVersions.id),
  reviewerId: text("reviewer_id").references(() => teachers.id),
  status: text("status").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classCourses = sqliteTable("class_courses", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id),
  courseVersionId: text("course_version_id").notNull().references(() => courseVersions.id),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("active"),
  assignmentEnabled: integer("assignment_enabled").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("class_courses_version_idx").on(table.classId, table.courseVersionId),
]);

export const courseProjectSubmissions = sqliteTable("course_project_submissions", {
  id: text("id").primaryKey(),
  classCourseId: text("class_course_id").notNull().references(() => classCourses.id),
  studentId: text("student_id").notNull().references(() => students.id),
  projectUrl: text("project_url").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("course_project_submissions_course_student_idx").on(table.classCourseId, table.studentId),
  index("course_project_submissions_student_idx").on(table.studentId, table.updatedAt),
]);

export const questionResults = sqliteTable("question_results", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull().references(() => students.id),
  questionId: text("question_id").notNull().references(() => questions.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  analysisJson: text("analysis_json").notNull(),
  resultsJson: text("results_json").notNull(),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("question_results_student_question_idx").on(table.studentId, table.questionId),
]);

export const teacherCoursePermissions = sqliteTable("teacher_course_permissions", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  courseId: text("course_id").notNull().references(() => courses.id),
  allowed: integer("allowed").notNull().default(1),
  updatedBy: text("updated_by").notNull().references(() => teachers.id),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("teacher_course_permissions_unique_idx").on(table.teacherId, table.courseId),
]);

export const userActivityLogs = sqliteTable("user_activity_logs", {
  id: text("id").primaryKey(),
  userType: text("user_type").notNull(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull().references(() => students.id),
  chapterNo: integer("chapter_no").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileSize: integer("file_size").notNull(),
  checklistJson: text("checklist_json").notNull(),
  autoScore: integer("auto_score").notNull(),
  status: text("status").notNull(),
  externalStatus: text("external_status").notNull().default("not_required"),
  projectUrl: text("project_url").notNull().default(""),
  feedback: text("feedback").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("submissions_student_chapter_idx").on(table.studentId, table.chapterNo),
]);

export const badges = sqliteTable("badges", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull().references(() => students.id),
  chapterNo: integer("chapter_no").notNull(),
  badgeName: text("badge_name").notNull(),
  earnedAt: text("earned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("badges_student_chapter_idx").on(table.studentId, table.chapterNo),
]);

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: text("admin_id").notNull().references(() => teachers.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
