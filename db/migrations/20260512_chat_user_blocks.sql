-- Chat: per-user blocks between participants (not moderation-wide bans)

CREATE TABLE IF NOT EXISTS chat_user_blocks (
  id BIGSERIAL PRIMARY KEY,
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_user_blocks_blocker ON chat_user_blocks(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_blocks_blocked ON chat_user_blocks(blocked_user_id);
