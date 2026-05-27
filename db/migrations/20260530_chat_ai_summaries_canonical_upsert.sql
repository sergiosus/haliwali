-- Upsert support for chat_id-based chat_ai_summaries (production schema).
-- Safe no-op when index already exists or table uses legacy (conversation_id, user_id).

CREATE UNIQUE INDEX IF NOT EXISTS chat_ai_summaries_chat_id_uidx
  ON chat_ai_summaries (chat_id)
  WHERE chat_id IS NOT NULL AND chat_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS chat_ai_summaries_conversation_id_uidx
  ON chat_ai_summaries (conversation_id)
  WHERE conversation_id IS NOT NULL AND conversation_id <> '';
