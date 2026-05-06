import { NextResponse } from "next/server";
import {
  buildListingConversationId,
  isListingConversationParticipant,
  mergeClientSnapshot,
} from "../../../../lib/serverListingChatsStore";
import type { ClientChatSyncMessage } from "../../../../lib/serverListingChatsStore";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  if (!chatId || !isListingConversationParticipant(uid, chatId)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const listingId = typeof o.listingId === "string" ? o.listingId.trim() : "";
  const listingTitle = typeof o.listingTitle === "string" ? o.listingTitle.trim() : "Объявление";
  const listingOwnerId = typeof o.listingOwnerId === "string" ? o.listingOwnerId.trim() : "";
  const buyerId = typeof o.buyerId === "string" ? o.buyerId.trim() : "";
  const msgsRaw = o.messages;
  if (!listingId || !listingOwnerId || !buyerId || !Array.isArray(msgsRaw)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const expectedId = buildListingConversationId(listingId, listingOwnerId, buyerId);
  if (chatId !== expectedId) {
    return NextResponse.json({ error: "CHAT_MISMATCH" }, { status: 400 });
  }

  const messages: ClientChatSyncMessage[] = [];
  for (const row of msgsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const senderId = typeof r.senderId === "string" ? r.senderId.trim() : "";
    const createdAt = typeof r.createdAt === "number" ? r.createdAt : 0;
    if (!id || !senderId || !Number.isFinite(createdAt)) continue;
    messages.push({
      id,
      senderId,
      ...(typeof r.senderName === "string" && r.senderName.trim() ? { senderName: r.senderName.trim() } : {}),
      createdAt,
      ...(r.type === "file" ? { type: "file" as const } : {}),
      ...(typeof r.text === "string" ? { text: r.text } : {}),
      ...(typeof r.fileUrl === "string" && r.fileUrl.trim() ? { fileUrl: r.fileUrl.trim() } : {}),
      ...(typeof r.fileName === "string" && r.fileName.trim() ? { fileName: r.fileName.trim() } : {}),
      ...(typeof r.replyToMessageId === "string" && r.replyToMessageId.trim()
        ? { replyToMessageId: r.replyToMessageId.trim() }
        : {}),
      ...(typeof r.replyToText === "string" && r.replyToText.trim() ? { replyToText: r.replyToText.trim() } : {}),
      ...(typeof r.editedAt === "string" ? { editedAt: r.editedAt } : {}),
    });
  }

  await mergeClientSnapshot({
    conversationId: chatId,
    viewerUserId: uid,
    listingId,
    listingTitle: listingTitle || "Объявление",
    listingOwnerId,
    buyerId,
    messages,
  });

  return NextResponse.json({ ok: true });
}
