-- Haliwali — PostgreSQL init (current code expectations)
-- Apply (example):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/init.sql
--
-- This file is generated from code audit of server-side `getPool().query(...)` usage:
-- - app/lib/serverUsersPg.ts
-- - app/lib/serverSessionsPg.ts
-- - app/lib/serverRegistrationStore.ts
-- - app/lib/serverListingsPg.ts
-- - app/lib/serverCallsStore.ts (audio_calls)
--
-- Note: chats, reports/complaints, support tickets, admin sessions, rate limits, etc.
-- are still file-backed under `.data/` and are NOT included here.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- users (auth accounts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  phone_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT,
  deletion_status TEXT NOT NULL DEFAULT '',
  delete_requested_at BIGINT,
  delete_scheduled_at BIGINT,
  full_name TEXT NOT NULL DEFAULT '',
  public_display_name TEXT NOT NULL DEFAULT ''
);

-- Backfill/upgrade safety (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_status TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_requested_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_scheduled_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone <> '';
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- ─────────────────────────────────────────────────────────────────────────────
-- auth_sessions (opaque tokens stored server-side; cookie contains token)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- registration_pending (signup-in-progress)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_pending (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  confirm_method TEXT NOT NULL CHECK (confirm_method IN ('email', 'phone')),
  code_hash TEXT NOT NULL DEFAULT '',
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  last_sent_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS registration_pending_lookup_idx
  ON registration_pending (confirm_method, consumed, last_sent_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- listings (marketplace ads; PostgreSQL source of truth when DATABASE_URL is set)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  edit_token TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task', 'service', 'product_sell', 'product_buy')),
  status TEXT NOT NULL,
  moderation_reason TEXT NOT NULL DEFAULT '',
  deal_status TEXT NOT NULL DEFAULT 'active',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_name TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address_public BOOLEAN NOT NULL DEFAULT FALSE,
  specialization TEXT,
  price BIGINT,
  phone TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  author_public_name TEXT NOT NULL DEFAULT '',
  listing_lifecycle TEXT NOT NULL DEFAULT 'live',
  deleted_at BIGINT,
  delete_permanently_at BIGINT,
  archived_at BIGINT,
  deleted_snapshot JSONB
);

-- Backfill/upgrade safety (idempotent)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS author_public_name TEXT NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_lifecycle TEXT NOT NULL DEFAULT 'live';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS delete_permanently_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS archived_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_snapshot JSONB;

CREATE INDEX IF NOT EXISTS listings_owner_id_idx ON listings (owner_id);
CREATE INDEX IF NOT EXISTS listings_status_category_slug_idx ON listings (status, category_slug);
CREATE INDEX IF NOT EXISTS listings_deal_status_idx ON listings (deal_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- support tickets (admin + user support inbox)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  listing_id TEXT,
  listing_title TEXT
);

CREATE INDEX IF NOT EXISTS support_tickets_updated_at_idx ON support_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_user_updated_at_idx ON support_tickets (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  sender_type TEXT,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_created_at_idx ON support_messages (ticket_id, created_at ASC);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'account';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- reports / complaints (admin moderation inbox)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS reports_dismissed_created_at_idx ON reports (dismissed, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- listing chats (file-backed today; PostgreSQL schema for migration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_conversations (
  conversation_id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  listing_title TEXT NOT NULL,
  listing_owner_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  participant_ids TEXT[] NOT NULL,
  last_message_text TEXT NOT NULL DEFAULT '',
  last_message_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS listing_conversations_buyer_last_message_at_idx
  ON listing_conversations (buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS listing_conversations_owner_last_message_at_idx
  ON listing_conversations (listing_owner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS listing_conversations_listing_last_message_at_idx
  ON listing_conversations (listing_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS listing_messages (
  conversation_id TEXT NOT NULL REFERENCES listing_conversations (conversation_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS listing_messages_conversation_created_at_idx
  ON listing_messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS listing_messages_recipient_read_at_idx
  ON listing_messages (recipient_id, read_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- audio calls (WebRTC signaling; PostgreSQL when DATABASE_URL is set)
-- app/lib/serverCallsStore.ts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audio_calls (
  call_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  room_token TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  caller_display_name TEXT,
  participant_ids TEXT[] NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  offer_json TEXT,
  answer_json TEXT,
  ice_from_caller TEXT[] NOT NULL DEFAULT '{}'::text[],
  ice_from_callee TEXT[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS audio_calls_chat_id_idx ON audio_calls (chat_id);
CREATE INDEX IF NOT EXISTS audio_calls_expires_at_idx ON audio_calls (expires_at);
CREATE INDEX IF NOT EXISTS audio_calls_participant_ids_gin ON audio_calls USING GIN (participant_ids);

CREATE TABLE IF NOT EXISTS chat_message_registry (
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS chat_message_deletions (
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at BIGINT,
  deleted_by_user_id TEXT,
  deleted_for_user_ids TEXT[],
  PRIMARY KEY (chat_id, message_id)
);

COMMIT;

