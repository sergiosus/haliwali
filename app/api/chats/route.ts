import path from "node:path";
import { NextResponse } from "next/server";
import {
  pickLatestStoredListingMessage,
  buildListingConversationId,
  getListingConversation,
  isListingConversationParticipant,
  listListingConversationsForUser,
  unreadCountForUser,
} from "../../lib/serverListingChatsStore";
import {
  buildCompanyConversationId,
  getCompanyConversation,
  isCompanyConversationParticipant,
  listCompanyConversationsForUser,
  pickLatestStoredCompanyMessage,
  unreadCompanyCountForUser,
} from "../../lib/serverCompanyChatsStore";
import { getCatalogCompanyChatTarget } from "../../lib/serverCatalogStore";
import {
  lastMessageSenderCabinetLabel,
  publicCabinetLabelForStoredUser,
  publicChatMessageSenderLabel,
} from "../../lib/serverChatParticipantLabel";
import { getListingById, normalizeListingId } from "../../lib/serverListingsStore";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";
import { readUsersDb } from "../../lib/serverUsersStore";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

function peerUserForViewer(conv: { listingOwnerId: string; buyerId: string }, viewerId: string): string {
  const v = viewerId.trim();
  if (conv.listingOwnerId.trim() === v) return conv.buyerId.trim();
  return conv.listingOwnerId.trim();
}

function storedMsgToApi(m: import("../../lib/serverListingChatsStore").StoredListingChatMessage) {
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
  };
}

function storedCompanyMsgToApi(m: import("../../lib/serverCompanyChatsStore").StoredCompanyChatMessage) {
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
  };
}

/** Список переписок для кабинета / шапки; опционально — сообщения по listingId + peerUserId (тот же формат что GET /api/chats/[chatId]). */
export async function GET(req: Request) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const qListing = (url.searchParams.get("listingId") ?? "").trim();
  const qCompany = (url.searchParams.get("companyId") ?? "").trim();
  const qPeer = (url.searchParams.get("peerUserId") ?? "").trim();

  if (qCompany) {
    const companyId = Number(qCompany);
    const company = await getCatalogCompanyChatTarget(companyId);
    if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (company.profileStatus !== "verified" || !company.ownerUserId) {
      return NextResponse.json({
        ok: false,
        error: "NO_VERIFIED_OWNER",
        message: "У компании пока нет подтверждённого владельца",
      }, { status: 409 });
    }
    const ownerId = company.ownerUserId.trim();
    const customerId = uid === ownerId ? qPeer : uid;
    if (!customerId || customerId === ownerId) return NextResponse.json({ error: "BAD_PEER" }, { status: 400 });
    const chatId = buildCompanyConversationId(company.id, ownerId, customerId);
    if (!isCompanyConversationParticipant(uid, chatId)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const conv = await getCompanyConversation(chatId);
    return NextResponse.json({
      ok: true,
      chatType: "company",
      chatId,
      conversation: conv ?
        {
          companyId: conv.companyId,
          companyTitle: conv.companyTitle,
          ownerUserId: conv.ownerUserId,
          customerId: conv.customerId,
          lastMessageText: conv.lastMessageText,
          lastMessageAt: conv.lastMessageAt,
        }
      : {
          companyId: company.id,
          companyTitle: company.name,
          ownerUserId: ownerId,
          customerId,
        },
      messages: conv ? conv.messages.map(storedCompanyMsgToApi) : [],
    });
  }

  if (qListing && qPeer) {
    const listing = await getListingById(qListing);
    if (!listing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const ownerId = (listing.ownerId ?? "").trim();
    if (!ownerId) {
      return NextResponse.json({ error: "BAD_LISTING" }, { status: 400 });
    }
    const peer = qPeer.trim();
    const buyerResolved = uid === ownerId ? peer : uid;
    if (!buyerResolved || buyerResolved === ownerId) {
      return NextResponse.json({ error: "BAD_PEER" }, { status: 400 });
    }
    const L = normalizeListingId(listing.id);
    const chatId = buildListingConversationId(L, ownerId, buyerResolved);
    if (!isListingConversationParticipant(uid, chatId)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const conv = await getListingConversation(chatId);
    if (!conv) {
      return NextResponse.json({
        ok: true,
        chatId,
        messages: [],
        conversation: null,
      });
    }
    return NextResponse.json({
      ok: true,
      chatId,
      conversation: {
        listingId: conv.listingId,
        listingTitle: conv.listingTitle,
        listingOwnerId: conv.listingOwnerId,
        buyerId: conv.buyerId,
        lastMessageText: conv.lastMessageText,
        lastMessageAt: conv.lastMessageAt,
      },
      messages: conv.messages.map(storedMsgToApi),
    });
  }

  const [rows, companyRows] = await Promise.all([
    listListingConversationsForUser(uid),
    listCompanyConversationsForUser(uid),
  ]);
  const usersDb = await readUsersDb(USERS_PATH);
  const usersById = usersDb.usersById;
  let unreadTotal = 0;
  const listingConversations = rows.map((c) => {
    const preview = typeof c.lastMessageText === "string" ? c.lastMessageText : "";
    const otherUserId = peerUserForViewer(c, uid);
    const unread = unreadCountForUser(c, uid);
    unreadTotal += unread;
    const peer = usersById[otherUserId.trim()];
    const participantPublicName = publicCabinetLabelForStoredUser(peer);
    const lm = pickLatestStoredListingMessage(c);
    const lastMessageSenderLabel = lastMessageSenderCabinetLabel(uid, lm, usersById);
    return {
      conversationId: c.conversationId,
      chatType: "listing",
      listingId: c.listingId,
      listingTitle: c.listingTitle || "Объявление",
      otherUserId,
      participantPublicName,
      lastMessageSenderLabel,
      lastMessageText: preview,
      lastMessageAt: c.lastMessageAt,
      unreadCount: unread,
    };
  });
  const companyConversations = companyRows.map((c) => {
    const preview = typeof c.lastMessageText === "string" ? c.lastMessageText : "";
    const otherUserId = c.ownerUserId.trim() === uid ? c.customerId.trim() : c.ownerUserId.trim();
    const unread = unreadCompanyCountForUser(c, uid);
    unreadTotal += unread;
    const peer = usersById[otherUserId.trim()];
    const participantPublicName = publicCabinetLabelForStoredUser(peer);
    const lm = pickLatestStoredCompanyMessage(c);
    const lastMessageSenderLabel =
      !lm ? ""
      : lm.senderId.trim() === uid ? "Вы"
      : publicCabinetLabelForStoredUser(usersById[lm.senderId.trim()]) ||
        publicChatMessageSenderLabel(lm.senderId, lm.senderName);
    return {
      conversationId: c.conversationId,
      chatType: "company",
      companyId: c.companyId,
      companyTitle: c.companyTitle || "Компания",
      otherUserId,
      participantPublicName,
      lastMessageSenderLabel,
      lastMessageText: preview,
      lastMessageAt: c.lastMessageAt,
      unreadCount: unread,
    };
  });
  const conversations = [...listingConversations, ...companyConversations].sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt,
  );

  const viewerPublicName = publicCabinetLabelForStoredUser(usersById[uid.trim()]);

  return NextResponse.json({
    ok: true,
    unreadTotal,
    ...(viewerPublicName ? { viewerPublicName } : {}),
    conversations,
  });
}
