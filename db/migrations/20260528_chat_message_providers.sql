-- Channel abstraction for listing/company chats (no external APIs yet).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260528_chat_message_providers.sql
--
-- Safe: ADD COLUMN with DEFAULT; existing rows become provider = 'internal'.

ALTER TABLE listing_conversations
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_chat_id TEXT;

ALTER TABLE listing_conversations
  DROP CONSTRAINT IF EXISTS listing_conversations_provider_check;

ALTER TABLE listing_conversations
  ADD CONSTRAINT listing_conversations_provider_check
  CHECK (provider IN ('internal', 'max_future', 'telegram_future', 'vk_future'));

ALTER TABLE listing_messages
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB;

ALTER TABLE listing_messages
  DROP CONSTRAINT IF EXISTS listing_messages_provider_check;

ALTER TABLE listing_messages
  ADD CONSTRAINT listing_messages_provider_check
  CHECK (provider IN ('internal', 'max_future', 'telegram_future', 'vk_future'));

ALTER TABLE company_conversations
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_chat_id TEXT;

ALTER TABLE company_conversations
  DROP CONSTRAINT IF EXISTS company_conversations_provider_check;

ALTER TABLE company_conversations
  ADD CONSTRAINT company_conversations_provider_check
  CHECK (provider IN ('internal', 'max_future', 'telegram_future', 'vk_future'));

ALTER TABLE company_messages
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB;

ALTER TABLE company_messages
  DROP CONSTRAINT IF EXISTS company_messages_provider_check;

ALTER TABLE company_messages
  ADD CONSTRAINT company_messages_provider_check
  CHECK (provider IN ('internal', 'max_future', 'telegram_future', 'vk_future'));

-- Future bridge dedup (per conversation + channel + external message id).
CREATE UNIQUE INDEX IF NOT EXISTS listing_messages_external_mirror_uidx
  ON listing_messages (conversation_id, provider, external_message_id)
  WHERE external_message_id IS NOT NULL AND provider <> 'internal';

CREATE UNIQUE INDEX IF NOT EXISTS company_messages_external_mirror_uidx
  ON company_messages (conversation_id, provider, external_message_id)
  WHERE external_message_id IS NOT NULL AND provider <> 'internal';
