import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  pinHash: text("pin_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("teachers_email_idx").on(table.email),
]);

export const classes = sqliteTable("classes", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("classes_code_idx").on(table.code),
]);

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id),
  seatNo: text("seat_no").notNull(),
  nickname: text("nickname").notNull(),
  pinHash: text("pin_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("students_class_seat_idx").on(table.classId, table.seatNo),
]);

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
