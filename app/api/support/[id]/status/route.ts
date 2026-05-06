import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getSupportTicketById, upsertSupportTicket } from "../../../../lib/serverSupportStore";
import type { SupportTicketStatus } from "../../../../lib/serverSupportStore";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const st = (body as { status?: unknown }).status;
  const status =
    st === "open" || st === "in_progress" || st === "closed" ? (st as SupportTicketStatus) : null;
  if (!status) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const ticket = await getSupportTicketById(id);
  if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const now = Date.now();
  await upsertSupportTicket({
    ...ticket,
    status,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
