import { NextResponse } from "next/server";
import { adminPrivilegesActive } from "../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";
import {
  getSupportTicketById,
  newMessageId,
  upsertSupportTicket,
  type StoredSupportMessage,
} from "../../../../lib/serverSupportStore";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const text = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text.trim() : "";
  if (!text) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const ticket = await getSupportTicketById(id);
  if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const admin = await adminPrivilegesActive();
  const sessionUser = ((await getUserIdFromSessionCookie()) ?? "").trim();

  let role: "user" | "staff" | null = null;
  if (admin) role = "staff";
  else if (sessionUser && ticket.userId.trim() && sessionUser === ticket.userId.trim()) {
    if (ticket.status === "closed") {
      return NextResponse.json({ error: "CLOSED", message: "Обращение закрыто." }, { status: 403 });
    }
    role = "user";
  } else {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const msg: StoredSupportMessage = {
    id: newMessageId(),
    role,
    senderType: role === "staff" ? "admin" : "user",
    text,
    createdAt: Date.now(),
  };

  const now = Date.now();
  await upsertSupportTicket({
    ...ticket,
    messages: [...ticket.messages, msg],
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
