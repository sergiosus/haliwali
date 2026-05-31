-- Persist last admin offer search (marketplace SERP links) across reloads.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260531_catalog_offer_search_sessions.sql

CREATE TABLE IF NOT EXISTS catalog_offer_search_sessions (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'latest',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_offer_search_sessions_scope
  ON catalog_offer_search_sessions (scope);
