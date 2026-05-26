import { NextResponse } from "next/server";
import {
  parsePrivateChatFileIdFromMessageUrl,
  readChatPrivateFileMeta,
} from "../../../lib/serverChatPrivateFiles";
import { publicChatMessageSenderLabel } from "../../../lib/serverChatParticipantLabel";
import { chatUserBlockedForbidden } from "../../../lib/serverChatUserBlock";
import { appendCompanyChatMessage, buildCompanyConversationId } from "../../../lib/serverCompanyChatsStore";
import { getCatalogCompanyChatTarget } from "../../../lib/serverCatalogStore";
import { appendListingChatMessage, buildListingConversationId } from "../../../lib/serverListingChatsStore";
import { getListingById } from "../../../lib/serverListingsStore";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const listingIdRaw = typeof o.listingId === "string" ? o.listingId.trim() : "";
  const chatType = o.chatType === "company" ? "company" : "listing";
  const companyIdRaw = typeof o.companyId === "string" || typeof o.companyId === "number" ? String(o.companyId).trim() : "";
  const text = typeof o.text === "string" ? o.text : "";
  const type = o.type === "file" ? "file" : "text";
  const fileUrl = typeof o.fileUrl === "string" ? o.fileUrl.trim() : "";
  const fileName = typeof o.fileName === "string" ? o.fileName.trim() : "";
  const senderName = typeof o.senderName === "string" ? o.senderName : "";
  const peerRaw = typeof o.peerUserId === "string" ? o.peerUserId.trim() : "";
  const replyToMessageId = typeof o.replyToMessageId === "string" ? o.replyToMessageId.trim() : undefined;
  const replyToText = typeof o.replyToText === "string" ? o.replyToText.trim() : undefined;

  if (chatType === "company") {
    const companyId = Number(companyIdRaw);
    const company = await getCatalogCompanyChatTarget(companyId);
    if (!company) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });
    if (company.profileStatus !== "verified" || !company.ownerUserId) {
      return NextResponse.json({ error: "NO_VERIFIED_OWNER", message: "У компании пока нет подтверждённого владельца" }, { status: 409 });
    }
    const ownerId = company.ownerUserId.trim();
    const customerId = uid === ownerId ? peerRaw : uid;
    if (!customerId || customerId === ownerId) return NextResponse.json({ error: "BAD_PEER" }, { status: 400 });
    const conversationId = buildCompanyConversationId(company.id, ownerId, customerId);
    const recipientId = uid === ownerId ? customerId : ownerId;
    const blockedForbidden = await chatUserBlockedForbidden(uid, recipientId);
    if (blockedForbidden) return blockedForbidden;
    if (type === "file") {
      if (!fileUrl) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      const privateId = parsePrivateChatFileIdFromMessageUrl(fileUrl);
      if (privateId) {
        const meta = await readChatPrivateFileMeta(privateId);
        if (!meta || meta.chatId !== conversationId || meta.uploadedBy !== uid) {
          return NextResponse.json({ error: "BAD_FILE" }, { status: 400 });
        }
      }
    } else if (!text.trim()) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const msg = await appendCompanyChatMessage({
      conversationId,
      companyId: company.id,
      companyTitle: company.name,
      ownerUserId: ownerId,
      customerId,
      senderId: uid,
      recipientId,
      text: type === "file" ? text.trim() : text.trim(),
      type,
      ...(type === "file" ? { fileUrl, ...(fileName ? { fileName } : {}) } : {}),
      senderName,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(replyToText ? { replyToText } : {}),
    });
    return NextResponse.json({
      ok: true,
      message: {
        id: msg.id,
        senderId: msg.senderId,
        senderName: publicChatMessageSenderLabel(msg.senderId, msg.senderName),
        createdAt: msg.createdAt,
        type: msg.type ?? "text",
        text: msg.text,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        replyToMessageId: msg.replyToMessageId,
        replyToText: msg.replyToText,
        editedAt: msg.editedAt,
      },
    });
  }

  if (!listingIdRaw) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const listing = await getListingById(listingIdRaw);
  if (!listing) {
    return NextResponse.json({ error: "LISTING_NOT_FOUND" }, { status: 404 });
  }

  const ownerId = (listing.ownerId ?? "").trim();
  if (!ownerId) {
    return NextResponse.json({ error: "BAD_LISTING" }, { status: 400 });
  }

  let buyerId = "";
  if (uid === ownerId) {
    buyerId = peerRaw;
    if (!buyerId) {
      return NextResponse.json({ error: "PEER_REQUIRED" }, { status: 400 });
    }
  } else {
    buyerId = uid;
  }

  if (buyerId === ownerId) {
    return NextResponse.json({ error: "BAD_PEER" }, { status: 400 });
  }

  const conversationId = buildListingConversationId(listing.id, ownerId, buyerId);
  const recipientId = uid === ownerId ? buyerId : ownerId;

  const blockedForbidden = await chatUserBlockedForbidden(uid, recipientId);
  if (blockedForbidden) return blockedForbidden;

  const listingTitle = (listing.title ?? "").trim() || "Объявление";

  if (type === "file") {
    if (!fileUrl) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const privateId = parsePrivateChatFileIdFromMessageUrl(fileUrl);
    if (privateId) {
      const meta = await readChatPrivateFileMeta(privateId);
      if (!meta || meta.chatId !== conversationId || meta.uploadedBy !== uid) {
        return NextResponse.json({ error: "BAD_FILE" }, { status: 400 });
      }
    }
  } else if (!text.trim()) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const msg = await appendListingChatMessage({
    conversationId,
    listingId: listing.id,
    listingTitle,
    listingOwnerId: ownerId,
    buyerId,
    senderId: uid,
    recipientId,
    text: type === "file" ? (text.trim() ?? "") : text.trim(),
    type,
    ...(type === "file" ? { fileUrl, ...(fileName ? { fileName } : {}) } : {}),
    senderName,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(replyToText ? { replyToText } : {}),
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: msg.id,
      senderId: msg.senderId,
      senderName: publicChatMessageSenderLabel(msg.senderId, msg.senderName),
      createdAt: msg.createdAt,
      type: msg.type ?? "text",
      text: msg.text,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      replyToMessageId: msg.replyToMessageId,
      replyToText: msg.replyToText,
      editedAt: msg.editedAt,
    },
  });
}
