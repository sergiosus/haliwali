-- Admin password session + login rate limit storage (PostgreSQL)

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_login_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_login_rate_limits_last_attempt_at ON admin_login_rate_limits(last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_admin_login_rate_limits_blocked_until ON admin_login_rate_limits(blocked_until);

