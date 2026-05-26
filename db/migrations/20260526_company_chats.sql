CREATE TABLE IF NOT EXISTS company_conversations (
  conversation_id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  company_title TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  participant_ids TEXT[] NOT NULL,
  last_message_text TEXT NOT NULL DEFAULT '',
  last_message_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS company_conversations_participants_idx
  ON company_conversations USING GIN (participant_ids);

CREATE INDEX IF NOT EXISTS company_conversations_company_last_message_at_idx
  ON company_conversations (company_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS company_messages (
  conversation_id TEXT NOT NULL REFERENCES company_conversations (conversation_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  file_url TEXT,
  file_name TEXT,
  sender_name TEXT,
  reply_to_message_id TEXT,
  reply_to_text TEXT,
  edited_at TEXT,
  created_at BIGINT NOT NULL,
  read_at BIGINT,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS company_messages_conversation_created_at_idx
  ON company_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS company_messages_recipient_read_at_idx
  ON company_messages (recipient_id, read_at);
