-- Optional privacy-safe search analytics (ENABLE_SEARCH_ANALYTICS=true). No IP, no user id.

CREATE TABLE IF NOT EXISTS search_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  result_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_analytics_events_created_at_idx
  ON search_analytics_events (created_at DESC);
