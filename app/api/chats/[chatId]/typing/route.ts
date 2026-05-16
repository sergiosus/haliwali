import { NextResponse } from "next/server";
import { pulseChatTyping, readPeerTyping } from "../../../../lib/serverChatTyping";
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

  const peerTyping = await readPeerTyping(chatId, uid);
  return NextResponse.json({ ok: true, peerTyping });
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

  await pulseChatTyping(chatId, uid);
  return NextResponse.json({ ok: true });
}
