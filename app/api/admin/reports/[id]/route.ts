import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { deleteReportByIdPermanently } from "../../../../lib/serverTrustStore";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const ok = await deleteReportByIdPermanently(id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
