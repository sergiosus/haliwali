import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../../lib/serverSession";
import { restoreSoftDeletedUserByAdmin } from "../../../../../lib/serverUserSoftDelete";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(_req);
  if (csrf) return csrf;

  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const adminUserId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  const result = await restoreSoftDeletedUserByAdmin({
    usersPath: USERS_PATH,
    targetUserId: id,
    adminUserId,
  });

  if (result === "not_found") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (result === "not_deleted") return NextResponse.json({ error: "NOT_DELETED" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
