import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import {
  isChatParticipant,
  registerChatMessage,
} from "../../../lib/serverChatMessageStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string;
    messageId?: string;
    senderId?: string;
    createdAt?: number;
  };

  const chatId = String(body.chatId ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();
  const senderId = String(body.senderId ?? "").trim();
  const createdAt = typeof body.createdAt === "number" ? body.createdAt : undefined;

  if (!chatId || !messageId || !senderId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (senderId !== userId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!isChatParticipant(userId, chatId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await registerChatMessage(chatId, messageId, senderId, createdAt);
  return NextResponse.json({ ok: true });
}
