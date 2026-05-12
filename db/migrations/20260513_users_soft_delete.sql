-- User soft-delete / trash / purge metadata (additive)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at);
CREATE INDEX IF NOT EXISTS users_purge_after_idx ON users (purge_after);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log (target_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
