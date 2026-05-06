-- Trust / counters storage (PostgreSQL)

CREATE TABLE IF NOT EXISTS listing_views (
  listing_id TEXT PRIMARY KEY,
  views_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_view_dedup (
  dedup_key TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_listing_id ON listing_view_dedup(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_viewer_key ON listing_view_dedup(viewer_key);
CREATE INDEX IF NOT EXISTS idx_listing_view_dedup_expires_at ON listing_view_dedup(expires_at);

-- Reply stats need both count and sumMs to preserve existing averaging logic.
CREATE TABLE IF NOT EXISTS reply_stats (
  key TEXT PRIMARY KEY,
  user_id TEXT NULL,
  listing_id TEXT NULL,
  replies_count INTEGER NOT NULL DEFAULT 0,
  sum_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reply_stats_user_id ON reply_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_reply_stats_listing_id ON reply_stats(listing_id);
CREATE INDEX IF NOT EXISTS idx_reply_stats_updated_at ON reply_stats(updated_at);

