import { NextResponse } from "next/server";
import { loadChatAiConversation } from "../../../lib/serverChatAiConversation";
import { generateChatAiQuickReplies } from "../../../lib/serverChatAiQuickReplies";
import { isCompanyConversationParticipant } from "../../../lib/serverCompanyChatsStore";
import { isListingConversationParticipant } from "../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { chatId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const chatId = (body.chatId ?? "").trim();
  if (!chatId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const isCompany = chatId.startsWith("company:");
  const allowed = isCompany
    ? isCompanyConversationParticipant(uid, chatId)
    : isListingConversationParticipant(uid, chatId);
  if (!allowed) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const bundle = await loadChatAiConversation(chatId);
  if (!bundle) {
    return NextResponse.json(
      { ok: false, code: "INSUFFICIENT", message: "Недостаточно данных для подсказок." },
      { status: 200 },
    );
  }

  const result = await generateChatAiQuickReplies(bundle, uid);

  if (!result.ok) {
    const status = result.code === "UNCONFIGURED" ? 503 : result.code === "UPSTREAM" ? 502 : 200;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
        replies: result.code === "INSUFFICIENT" ? [] : undefined,
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, replies: result.replies });
}
