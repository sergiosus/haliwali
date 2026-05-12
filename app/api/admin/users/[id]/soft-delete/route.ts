import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../../lib/serverSession";
import { softDeleteUserByAdmin } from "../../../../../lib/serverUserSoftDelete";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const adminUserId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  const result = await softDeleteUserByAdmin({
    usersPath: USERS_PATH,
    targetUserId: id,
    adminUserId,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });

  if (result === "not_found") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (result === "self") return NextResponse.json({ error: "SELF_DELETE" }, { status: 409 });
  if (result === "last_admin") return NextResponse.json({ error: "LAST_ADMIN" }, { status: 409 });
  if (result === "already_deleted") return NextResponse.json({ error: "ALREADY_DELETED" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
