-- Persist discover/import candidate lists and last-10 search history.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260526_catalog_import_candidate_sessions.sql

CREATE TABLE IF NOT EXISTS catalog_import_candidate_sessions (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  queries_used JSONB NOT NULL DEFAULT '[]',
  candidates JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_candidate_sessions_updated
  ON catalog_import_candidate_sessions (updated_at DESC);
