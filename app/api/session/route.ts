import { requireActor } from "../auth";

export async function GET(request: Request) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;

  if (actor.teacher) {
    return Response.json({
      identity: {
        role: actor.teacher.role === "superadmin" ? "superadmin" : "teacher",
        name: actor.teacher.name,
        email: actor.teacher.email,
        status: actor.teacher.status,
      },
    });
  }

  if (actor.student) {
    return Response.json({
      identity: {
        role: "student",
        name: actor.student.nickname,
        email: actor.student.email,
        status: "active",
      },
    });
  }

  return Response.json({
    identity: {
      role: "unknown",
      name: actor.firebase.displayName || actor.firebase.email,
      email: actor.firebase.email,
      status: "unregistered",
    },
  });
}
