import path from "node:path";
import {
  listCompanyConversationsForUser,
  parseCompanyConversationId,
  unreadCompanyCountForUser,
} from "./serverCompanyChatsStore";
import {
  listListingConversationsForUser,
  parseListingConversationId,
  unreadCountForUser,
} from "./serverListingChatsStore";
import { listUserOpenChatAiTasks } from "./serverChatAiTasksStore";
import { listUserChatAiSummaries } from "./serverChatAiSummaryStore";
import { type ChatCrmStatus, listChatCrmRecordsForUser } from "./serverChatCrmStore";
import { publicCabinetLabelForStoredUser } from "./serverChatParticipantLabel";
import { readSupportDb } from "./serverSupportStore";
import { deriveSupportSubject, supportAppealClosedForUser } from "./supportUiLabels";
import { readUsersDb } from "./serverUsersStore";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export type WorkspaceFilters = {
  status: ChatCrmStatus | "";
  unreadOnly: boolean;
  hasTasksOnly: boolean;
};

export type WorkspaceChatRow = {
  conversationId: string;
  chatType: "listing" | "company";
  title: string;
  listingId: string;
  companyId: number;
  otherUserId: string;
  peerLabel: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
  crmStatus: ChatCrmStatus;
  openTaskCount: number;
  hasSummary: boolean;
};

export type WorkspaceTaskRow = {
  id: number;
  conversationId: string;
  title: string;
  deadlineText: string;
  assigneeText: string;
  createdAt: number;
  contextTitle: string;
};

export type WorkspaceSummaryRow = {
  conversationId: string;
  summaryPreview: string;
  createdAt: number;
  contextTitle: string;
};

export type WorkspaceNoteRow = {
  kind: "support" | "crm_note";
  id: string;
  title: string;
  preview: string;
  statusLabel: string;
  updatedAt: number;
  href: string;
};

export type AccountWorkspacePayload = {
  chats: WorkspaceChatRow[];
  tasks: WorkspaceTaskRow[];
  summaries: WorkspaceSummaryRow[];
  notes: WorkspaceNoteRow[];
};

const CRM_STATUS_LABEL: Record<ChatCrmStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  waiting: "Ожидание",
  done: "Завершено",
};

function peerUserForListing(conv: { listingOwnerId: string; buyerId: string }, viewerId: string): string {
  const v = viewerId.trim();
  if (conv.listingOwnerId.trim() === v) return conv.buyerId.trim();
  return conv.listingOwnerId.trim();
}

function contextTitleForConversation(
  conversationId: string,
  chatMeta: Map<string, { title: string; chatType: "listing" | "company" }>,
): string {
  return chatMeta.get(conversationId)?.title ?? "Чат";
}

function supportStatusLabel(status: string): string {
  if (supportAppealClosedForUser(status)) return "Закрыто";
  if (status === "in_progress") return "В работе";
  if (status === "open") return "Ожидает ответа";
  return "Открыто";
}

export function parseWorkspaceFilters(searchParams: URLSearchParams): WorkspaceFilters {
  const statusRaw = (searchParams.get("status") ?? "").trim();
  const status =
    statusRaw === "new" || statusRaw === "in_progress" || statusRaw === "waiting" || statusRaw === "done"
      ? statusRaw
      : "";
  const unreadOnly = searchParams.get("unread") === "1" || searchParams.get("unread") === "true";
  const hasTasksOnly = searchParams.get("hasTasks") === "1" || searchParams.get("hasTasks") === "true";
  return { status, unreadOnly, hasTasksOnly };
}

export async function loadAccountWorkspace(
  userIdRaw: string,
  filters: WorkspaceFilters,
): Promise<AccountWorkspacePayload> {
  const userId = userIdRaw.trim();
  if (!userId) {
    return { chats: [], tasks: [], summaries: [], notes: [] };
  }

  const [listingRows, companyRows, crmRows, tasks, summaries, supportDb, usersDb] = await Promise.all([
    listListingConversationsForUser(userId),
    listCompanyConversationsForUser(userId),
    listChatCrmRecordsForUser(userId),
    listUserOpenChatAiTasks(userId, 40),
    listUserChatAiSummaries(userId, 24),
    readSupportDb(),
    readUsersDb(USERS_PATH),
  ]);

  const usersById = usersDb.usersById;
  const crmByConversation = new Map(crmRows.map((r) => [r.conversationId, r]));
  const taskCountByConversation = new Map<string, number>();
  for (const t of tasks) {
    const cid = t.conversationId.trim();
    taskCountByConversation.set(cid, (taskCountByConversation.get(cid) ?? 0) + 1);
  }
  const summaryConversationIds = new Set(summaries.map((s) => s.conversationId));

  const chatMeta = new Map<string, { title: string; chatType: "listing" | "company" }>();

  const chats: WorkspaceChatRow[] = [];

  for (const c of listingRows) {
    const otherUserId = peerUserForListing(c, userId);
    const peer = usersById[otherUserId.trim()];
    const peerLabel = publicCabinetLabelForStoredUser(peer);
    const unread = unreadCountForUser(c, userId);
    const crm = crmByConversation.get(c.conversationId);
    const crmStatus = crm?.status ?? "new";
    const openTaskCount = taskCountByConversation.get(c.conversationId) ?? 0;
    const title = c.listingTitle || "Объявление";
    chatMeta.set(c.conversationId, { title, chatType: "listing" });
    chats.push({
      conversationId: c.conversationId,
      chatType: "listing",
      title,
      listingId: c.listingId,
      companyId: 0,
      otherUserId,
      peerLabel,
      lastMessageText: typeof c.lastMessageText === "string" ? c.lastMessageText : "",
      lastMessageAt: c.lastMessageAt,
      unreadCount: unread,
      crmStatus,
      openTaskCount,
      hasSummary: summaryConversationIds.has(c.conversationId),
    });
  }

  for (const c of companyRows) {
    const otherUserId = c.ownerUserId.trim() === userId ? c.customerId.trim() : c.ownerUserId.trim();
    const peer = usersById[otherUserId.trim()];
    const peerLabel = publicCabinetLabelForStoredUser(peer);
    const unread = unreadCompanyCountForUser(c, userId);
    const crm = crmByConversation.get(c.conversationId);
    const crmStatus = crm?.status ?? "new";
    const openTaskCount = taskCountByConversation.get(c.conversationId) ?? 0;
    const title = c.companyTitle || "Компания";
    chatMeta.set(c.conversationId, { title, chatType: "company" });
    chats.push({
      conversationId: c.conversationId,
      chatType: "company",
      title,
      listingId: "",
      companyId: c.companyId,
      otherUserId,
      peerLabel,
      lastMessageText: typeof c.lastMessageText === "string" ? c.lastMessageText : "",
      lastMessageAt: c.lastMessageAt,
      unreadCount: unread,
      crmStatus,
      openTaskCount,
      hasSummary: summaryConversationIds.has(c.conversationId),
    });
  }

  chats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  let filteredChats = chats;
  if (filters.status) {
    filteredChats = filteredChats.filter((c) => c.crmStatus === filters.status);
  }
  if (filters.unreadOnly) {
    filteredChats = filteredChats.filter((c) => c.unreadCount > 0);
  }
  if (filters.hasTasksOnly) {
    filteredChats = filteredChats.filter((c) => c.openTaskCount > 0);
  }

  const visibleConversationIds = new Set(filteredChats.map((c) => c.conversationId));

  const taskRows: WorkspaceTaskRow[] = tasks
    .filter((t) => !filters.hasTasksOnly || visibleConversationIds.has(t.conversationId))
    .map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      title: t.title,
      deadlineText: t.deadlineText,
      assigneeText: t.assigneeText,
      createdAt: t.createdAt,
      contextTitle: contextTitleForConversation(t.conversationId, chatMeta),
    }));

  const summaryRows: WorkspaceSummaryRow[] = summaries.map((s) => {
    const text = s.summaryText.trim();
    const preview = text.length > 220 ? `${text.slice(0, 217)}…` : text;
    return {
      conversationId: s.conversationId,
      summaryPreview: preview,
      createdAt: s.createdAt,
      contextTitle: contextTitleForConversation(s.conversationId, chatMeta),
    };
  });

  const notes: WorkspaceNoteRow[] = [];

  for (const t of supportDb.tickets) {
    if (t.userId.trim() !== userId) continue;
    const last = t.messages[t.messages.length - 1];
    const preview = last ? (last.text.length > 120 ? `${last.text.slice(0, 117)}…` : last.text) : "";
    notes.push({
      kind: "support",
      id: t.id,
      title: deriveSupportSubject(t),
      preview,
      statusLabel: supportStatusLabel(t.status),
      updatedAt: t.updatedAt,
      href: "/account?tab=support",
    });
  }

  for (const crm of crmRows) {
    const note = crm.privateNote.trim();
    const tagLine = crm.tags.length > 0 ? crm.tags.join(", ") : "";
    if (!note && !tagLine) continue;
    const preview = note || tagLine;
    const p = parseListingConversationId(crm.conversationId);
    const pc = parseCompanyConversationId(crm.conversationId);
    let href = "/chat";
    if (p) {
      const peer = userId === p.ownerId.trim() ? p.buyerId : p.ownerId;
      href = `/chat?listingId=${encodeURIComponent(p.listingId)}&peerUserId=${encodeURIComponent(peer)}`;
    } else if (pc) {
      const peer = userId === pc.ownerUserId.trim() ? pc.customerId : pc.ownerUserId;
      href = `/chat?chatType=company&companyId=${encodeURIComponent(String(pc.companyId))}&peerUserId=${encodeURIComponent(peer)}`;
    }
    notes.push({
      kind: "crm_note",
      id: `crm:${crm.conversationId}`,
      title: contextTitleForConversation(crm.conversationId, chatMeta),
      preview: preview.length > 120 ? `${preview.slice(0, 117)}…` : preview,
      statusLabel: CRM_STATUS_LABEL[crm.status],
      updatedAt: crm.updatedAt,
      href,
    });
  }

  notes.sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    chats: filteredChats.slice(0, 40),
    tasks: taskRows.slice(0, 40),
    summaries: summaryRows.slice(0, 24),
    notes: notes.slice(0, 30),
  };
}

export { CRM_STATUS_LABEL };
