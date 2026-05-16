import { getPool, usesPostgres } from "./pgPool";
import { normalizeChatDealStatus, type ChatDealStatus } from "./chatDealStatus";
import { isListingConversationParticipant } from "./serverListingChatsStore";

export type ChatDealStatusRow = {
  status: ChatDealStatus;
  updatedAt: number | null;
  updatedBy: string | null;
};

export async function readChatDealStatus(conversationId: string): Promise<ChatDealStatusRow> {
  const id = (conversationId ?? "").trim();
  if (!id) return { status: "new", updatedAt: null, updatedBy: null };
  if (!usesPostgres()) return { status: "new", updatedAt: null, updatedBy: null };

  const { rows } = await getPool().query<{
    deal_status: string;
    deal_status_updated_at: string | number | null;
    deal_status_updated_by: string | null;
  }>(
    `SELECT deal_status, deal_status_updated_at, deal_status_updated_by
     FROM listing_conversations WHERE conversation_id = $1 LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return { status: "new", updatedAt: null, updatedBy: null };
  const updatedAtRaw = r.deal_status_updated_at;
  const updatedAt =
    updatedAtRaw == null ? null : typeof updatedAtRaw === "number" ? updatedAtRaw : Number(updatedAtRaw);
  return {
    status: normalizeChatDealStatus(r.deal_status),
    updatedAt: Number.isFinite(updatedAt as number) ? (updatedAt as number) : null,
    updatedBy: (r.deal_status_updated_by ?? "").trim() || null,
  };
}

export async function setChatDealStatus(args: {
  conversationId: string;
  userId: string;
  status: ChatDealStatus;
}): Promise<ChatDealStatusRow | null> {
  const conversationId = (args.conversationId ?? "").trim();
  const userId = (args.userId ?? "").trim();
  if (!conversationId || !userId) return null;
  if (!isListingConversationParticipant(userId, conversationId)) return null;
  if (!usesPostgres()) {
    return { status: args.status, updatedAt: Date.now(), updatedBy: userId };
  }

  const now = Date.now();
  await getPool().query(
    `UPDATE listing_conversations
     SET deal_status = $2, deal_status_updated_at = $3, deal_status_updated_by = $4, updated_at = $3
     WHERE conversation_id = $1`,
    [conversationId, args.status, now, userId],
  );
  return { status: args.status, updatedAt: now, updatedBy: userId };
}
