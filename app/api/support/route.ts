import { NextResponse } from "next/server";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";
import {
  newMessageId,
  newSupportId,
  type StoredSupportMessage,
  type StoredSupportTicket,
  upsertSupportTicket,
} from "../../lib/serverSupportStore";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";
import { deriveSupportSubject } from "../../lib/supportUiLabels";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set(["listing_problem", "user_report", "question", "other"]);

/**
 * Create a support ticket (authenticated users only). Persists to `.data/support-tickets.json`.
 */
export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = (await getUserIdFromSessionCookie()) ?? "";
  if (!userId.trim()) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const theme = typeof o.theme === "string" ? o.theme.trim() : "";
  const message = typeof o.message === "string" ? o.message.trim() : "";
  const rawCat = typeof o.category === "string" ? o.category.trim() : "question";
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : "question";

  if (!message) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Введите сообщение." }, { status: 400 });
  }

  const now = Date.now();
  const text = theme ? `Тема: ${theme}\n\n${message}` : message;

  const msg: StoredSupportMessage = {
    id: newMessageId(),
    role: "user",
    senderType: "user",
    text,
    createdAt: now,
  };

  const ticketBase: StoredSupportTicket = {
    id: newSupportId(),
    userId: userId.trim(),
    source: "account",
    category,
    status: "open",
    messages: [msg],
    createdAt: now,
    updatedAt: now,
  };
  const ticket: StoredSupportTicket = {
    ...ticketBase,
    subject: deriveSupportSubject(ticketBase),
  };

  await upsertSupportTicket(ticket);

  return NextResponse.json({ ok: true, id: ticket.id });
}
