-- listing_view_events + listing_view_dedup (aligned with app/lib/serverListingViews.ts)
-- Idempotent: creates missing tables/columns; repairs older 20260512 schema (anonymous_viewer_id, viewed_at).

CREATE TABLE IF NOT EXISTS listing_view_dedup (
  dedup_key TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_listing_id ON listing_view_dedup (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_viewer_key ON listing_view_dedup (viewer_key);
CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_expires_at ON listing_view_dedup (expires_at);

CREATE TABLE IF NOT EXISTS listing_view_events (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_user_id TEXT NULL,
  viewer_fingerprint TEXT NULL,
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'anonymous_viewer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'viewer_fingerprint'
  ) THEN
    ALTER TABLE listing_view_events RENAME COLUMN anonymous_viewer_id TO viewer_fingerprint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'viewer_fingerprint'
  ) THEN
    ALTER TABLE listing_view_events ADD COLUMN viewer_fingerprint TEXT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'viewed_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE listing_view_events RENAME COLUMN viewed_at TO created_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE listing_view_events ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'ip_hash'
  ) THEN
    ALTER TABLE listing_view_events ADD COLUMN ip_hash TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_view_events' AND column_name = 'user_agent_hash'
  ) THEN
    ALTER TABLE listing_view_events ADD COLUMN user_agent_hash TEXT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_id ON listing_view_events (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_user_id ON listing_view_events (viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_fingerprint ON listing_view_events (viewer_fingerprint);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_created_at ON listing_view_events (created_at);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_created_at ON listing_view_events (listing_id, created_at DESC);
