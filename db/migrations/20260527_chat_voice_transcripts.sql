CREATE TABLE IF NOT EXISTS chat_voice_transcripts (
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'done', 'failed')),
  transcript_text TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_voice_transcripts_conversation_updated_idx
  ON chat_voice_transcripts (conversation_id, updated_at DESC);
