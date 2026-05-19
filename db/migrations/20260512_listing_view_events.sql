-- Per-view event log (see 20260519_listing_view_events_fix.sql for dedup + column alignment on existing DBs).

CREATE TABLE IF NOT EXISTS listing_view_events (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_user_id TEXT NULL,
  viewer_fingerprint TEXT NULL,
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_id ON listing_view_events (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_user_id ON listing_view_events (viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_fingerprint ON listing_view_events (viewer_fingerprint);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_created_at ON listing_view_events (created_at);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_created_at ON listing_view_events (listing_id, created_at DESC);
