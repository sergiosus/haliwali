import { getPool, usesPostgres } from "./pgPool";
import { isListingConversationParticipant } from "./serverListingChatsStore";

const TYPING_TTL_MS = 8_000;

export async function pulseChatTyping(conversationId: string, userId: string): Promise<void> {
  const cid = (conversationId ?? "").trim();
  const uid = (userId ?? "").trim();
  if (!cid || !uid || !isListingConversationParticipant(uid, cid)) return;
  if (!usesPostgres()) return;

  const now = Date.now();
  await getPool().query(
    `INSERT INTO chat_typing_pulse (conversation_id, user_id, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
    [cid, uid, now],
  );
}

export async function readPeerTyping(conversationId: string, viewerUserId: string): Promise<boolean> {
  const cid = (conversationId ?? "").trim();
  const viewer = (viewerUserId ?? "").trim();
  if (!cid || !viewer || !usesPostgres()) return false;

  const cutoff = Date.now() - TYPING_TTL_MS;
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM chat_typing_pulse
     WHERE conversation_id = $1 AND user_id <> $2 AND updated_at >= $3
     LIMIT 1`,
    [cid, viewer, cutoff],
  );
  return (rowCount ?? 0) > 0;
}
