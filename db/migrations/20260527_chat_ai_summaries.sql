CREATE TABLE IF NOT EXISTS chat_ai_summaries (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS chat_ai_summaries_conversation_user_created_idx
  ON chat_ai_summaries (conversation_id, user_id, created_at DESC);
