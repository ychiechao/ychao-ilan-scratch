import { requireSuperadmin } from "../../auth";
import { referenceStorageStatus } from "../../reference-storage";

export async function GET(request: Request) {
  const actor = await requireSuperadmin(request);
  if (actor instanceof Response) return actor;
  return Response.json({ storage: referenceStorageStatus() });
}
