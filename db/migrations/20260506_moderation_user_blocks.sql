-- Moderation: blocked users list

CREATE TABLE IF NOT EXISTS moderation_user_blocks (
  user_id TEXT PRIMARY KEY,
  reason TEXT NULL,
  blocked_by TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_user_blocks_blocked_by ON moderation_user_blocks(blocked_by);
CREATE INDEX IF NOT EXISTS idx_moderation_user_blocks_created_at ON moderation_user_blocks(created_at);

