import { NextResponse } from "next/server";
import { loadChatAiConversation } from "../../../../lib/serverChatAiConversation";
import { generateChatAiSummary } from "../../../../lib/serverChatAiSummary";
import { saveChatAiSummary } from "../../../../lib/serverChatAiSummaryStore";
import { isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import { isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
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

  let body: { save?: boolean; summaryText?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.save === true) {
    const summaryText = typeof body.summaryText === "string" ? body.summaryText.trim() : "";
    if (!summaryText) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const saved = await saveChatAiSummary({ conversationId: chatId, userId: uid, summaryText });
    if (!saved.ok) {
      return NextResponse.json(
        { error: "STORAGE_UNAVAILABLE", message: "Не удалось сохранить итог." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, saved: true, id: saved.id });
  }

  const bundle = await loadChatAiConversation(chatId);
  const messages = bundle?.messages ?? [];
  const result = await generateChatAiSummary(messages);

  if (!result.ok) {
    const status = result.code === "UNCONFIGURED" ? 503 : result.code === "UPSTREAM" ? 502 : 200;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
