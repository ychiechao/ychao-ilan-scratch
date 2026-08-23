import { destroyAdminSession } from "../_auth";

export async function POST(request: Request) {
  return destroyAdminSession(request);
}
