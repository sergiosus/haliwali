import { NextResponse } from "next/server";
import { publicChatMessageSenderLabel } from "../../../../lib/serverChatParticipantLabel";
import {
  generateChatAiSummary,
  type ChatSummarySourceMessage,
} from "../../../../lib/serverChatAiSummary";
import { saveChatAiSummary } from "../../../../lib/serverChatAiSummaryStore";
import { getCompanyConversation, isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import { getListingConversation, isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

function toSummaryMessages(
  rows: Array<{
    createdAt: number;
    senderId: string;
    senderName?: string;
    type?: "text" | "file";
    text?: string;
    fileName?: string;
  }>,
): ChatSummarySourceMessage[] {
  return rows.map((m) => ({
    createdAt: m.createdAt,
    senderLabel: publicChatMessageSenderLabel(m.senderId, m.senderName),
    type: m.type ?? "text",
    text: m.text,
    fileName: m.fileName,
  }));
}

async function loadConversationMessages(chatId: string) {
  if (chatId.startsWith("company:")) {
    const conv = await getCompanyConversation(chatId);
    if (!conv) return [];
    return toSummaryMessages(conv.messages);
  }
  const conv = await getListingConversation(chatId);
  if (!conv) return [];
  return toSummaryMessages(conv.messages);
}

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

  const messages = await loadConversationMessages(chatId);
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
