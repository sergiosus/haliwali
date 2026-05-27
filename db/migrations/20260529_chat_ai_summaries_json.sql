-- Structured CRM intelligence for chat AI summaries.
-- conversation_id is the chat_id used by the app API.

ALTER TABLE chat_ai_summaries
  ADD COLUMN IF NOT EXISTS summary_json JSONB,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT;

UPDATE chat_ai_summaries
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Keep one row per chat + user for upserts (remove older duplicates if any).
DELETE FROM chat_ai_summaries a
USING chat_ai_summaries b
WHERE a.conversation_id = b.conversation_id
  AND a.user_id = b.user_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS chat_ai_summaries_conversation_user_uidx
  ON chat_ai_summaries (conversation_id, user_id);

CREATE INDEX IF NOT EXISTS chat_ai_summaries_conversation_user_updated_idx
  ON chat_ai_summaries (conversation_id, user_id, updated_at DESC);
