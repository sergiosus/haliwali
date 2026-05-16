import { NextResponse } from "next/server";
import { publicChatMessageSenderLabel } from "../../../lib/serverChatParticipantLabel";
import { getListingConversation, isListingConversationParticipant } from "../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

function storedMsgToApi(m: import("../../../lib/serverListingChatsStore").StoredListingChatMessage) {
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: publicChatMessageSenderLabel(m.senderId, m.senderName),
    createdAt: m.createdAt,
    type: m.type ?? "text",
    text: m.text,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    replyToMessageId: m.replyToMessageId,
    replyToText: m.replyToText,
    editedAt: m.editedAt,
    ...(m.readAt != null ? { readAt: m.readAt } : {}),
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  if (!chatId || !isListingConversationParticipant(uid, chatId)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const conv = await getListingConversation(chatId);
  const messages = conv ? conv.messages.map(storedMsgToApi) : [];
  return NextResponse.json({
    ok: true,
    messages,
    ...(conv
      ? {
          listingId: conv.listingId,
          listingTitle: conv.listingTitle,
        }
      : {}),
  });
}
