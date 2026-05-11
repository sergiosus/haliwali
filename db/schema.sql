-- Haliwali / Grinex Trade — PostgreSQL schema for auth (users + sessions + registration pending).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql

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

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_display_name TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone <> '';

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);

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

-- Listings / ads (single source of truth when using PostgreSQL).
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
  author_public_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS listings_owner_id_idx ON listings (owner_id);
CREATE INDEX IF NOT EXISTS listings_status_category_slug_idx ON listings (status, category_slug);
CREATE INDEX IF NOT EXISTS listings_deal_status_idx ON listings (deal_status);

-- Profile phone OTP ownership (production); replaces `.data/profile-phone-owners.json` for Postgres deployments.
CREATE TABLE IF NOT EXISTS phone_owners (
  phone TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_phone_owners_phone ON phone_owners(phone);
CREATE INDEX IF NOT EXISTS idx_phone_owners_user_id ON phone_owners(user_id);
