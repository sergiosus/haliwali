-- Marketplace chat: deal status + typing pulses (additive)

ALTER TABLE listing_conversations
  ADD COLUMN IF NOT EXISTS deal_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS deal_status_updated_at BIGINT,
  ADD COLUMN IF NOT EXISTS deal_status_updated_by TEXT;

CREATE INDEX IF NOT EXISTS listing_conversations_deal_status_idx
  ON listing_conversations (deal_status);

CREATE TABLE IF NOT EXISTS chat_typing_pulse (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_typing_pulse_updated_idx
  ON chat_typing_pulse (conversation_id, updated_at DESC);
