import { ensureDb } from "../../../../db";
import { adminError, requireAdmin } from "../_auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return adminError();
  const db = await ensureDb();

  const teachers = await db
    .prepare(
      `SELECT id, name, email, role, status, must_change_pin, created_at
       FROM teachers ORDER BY CASE role WHEN 'superadmin' THEN 0 ELSE 1 END, created_at DESC`
    )
    .all();
  const classes = await db
    .prepare(
      `SELECT c.id, c.teacher_id, c.name, c.code, c.status, c.created_at,
        t.name AS teacher_name, t.email AS teacher_email,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
       FROM classes c JOIN teachers t ON t.id = c.teacher_id
       ORDER BY c.created_at DESC`
    )
    .all();

  return Response.json({ teachers: teachers.results ?? [], classes: classes.results ?? [] });
}
