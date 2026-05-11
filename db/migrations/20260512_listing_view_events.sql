-- Per-view event log for listing analytics (additive; aggregate listing_views unchanged).

CREATE TABLE IF NOT EXISTS listing_view_events (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_user_id TEXT NULL,
  anonymous_viewer_id TEXT NULL,
  owner_user_id TEXT NULL,
  city TEXT NULL,
  region TEXT NULL,
  country TEXT NULL,
  user_agent_hash TEXT NULL,
  ip_hash TEXT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_id ON listing_view_events (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_user_id ON listing_view_events (viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_anonymous_viewer_id ON listing_view_events (anonymous_viewer_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewed_at ON listing_view_events (viewed_at);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_viewed_at ON listing_view_events (listing_id, viewed_at DESC);
