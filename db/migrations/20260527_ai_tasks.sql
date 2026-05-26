-- AI task extraction saves (per user + conversation).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260527_ai_tasks.sql

CREATE TABLE IF NOT EXISTS ai_tasks (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  deadline_text TEXT NOT NULL DEFAULT 'без срока',
  assignee_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  source_type TEXT NOT NULL DEFAULT 'chat',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_tasks_conversation_user_created_idx
  ON ai_tasks (conversation_id, user_id, created_at DESC);
