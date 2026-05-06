import { NextResponse } from "next/server";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { getDeletionsForChat, isChatParticipant } from "../../../lib/serverChatMessageStore";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const chatId = (url.searchParams.get("chatId") ?? "").trim();
  if (!chatId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (!isChatParticipant(userId, chatId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const deletions = await getDeletionsForChat(chatId);
  return NextResponse.json({ ok: true, deletions });
}
