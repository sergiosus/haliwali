import path from "node:path";
import { NextResponse } from "next/server";
import { immediateAccountDeletion } from "../../../../../lib/serverAccountDeletion";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../../lib/serverCsrf";
import { setUserModerationBlocked } from "../../../../../lib/serverModerationBlockedStore";

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

  await setUserModerationBlocked(id, false);
  await immediateAccountDeletion(USERS_PATH, id);
  return NextResponse.json({ ok: true });
}
