import { NextResponse } from "next/server";
import { CHAT_DEAL_STATUSES, normalizeChatDealStatus } from "../../../../lib/chatDealStatus";
import { readChatDealStatus, setChatDealStatus } from "../../../../lib/serverChatDealStatus";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent(raw ?? "").trim();
  if (!chatId || !isListingConversationParticipant(uid, chatId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const row = await readChatDealStatus(chatId);
  return NextResponse.json({ ok: true, dealStatus: row.status, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent(raw ?? "").trim();
  if (!chatId || !isListingConversationParticipant(uid, chatId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = normalizeChatDealStatus(body.status);
  if (!(CHAT_DEAL_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const row = await setChatDealStatus({ conversationId: chatId, userId: uid, status });
  if (!row) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({ ok: true, dealStatus: row.status, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
}
