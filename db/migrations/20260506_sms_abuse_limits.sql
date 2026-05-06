-- SMS/OTP codes + rate limits + abuse tracking (PostgreSQL)

CREATE TABLE IF NOT EXISTS sms_codes (
  key TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sms_codes_target ON sms_codes(target);
CREATE INDEX IF NOT EXISTS idx_sms_codes_purpose ON sms_codes(purpose);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires_at ON sms_codes(expires_at);

CREATE TABLE IF NOT EXISTS sms_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_last_attempt_at ON sms_rate_limits(last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_blocked_until ON sms_rate_limits(blocked_until);

CREATE TABLE IF NOT EXISTS abuse_rate_limits (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_scope ON abuse_rate_limits(scope);
CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_last_attempt_at ON abuse_rate_limits(last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_blocked_until ON abuse_rate_limits(blocked_until);

CREATE TABLE IF NOT EXISTS abuse_events (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_events_scope ON abuse_events(scope);
CREATE INDEX IF NOT EXISTS idx_abuse_events_key ON abuse_events(key);
CREATE INDEX IF NOT EXISTS idx_abuse_events_event_type ON abuse_events(event_type);
CREATE INDEX IF NOT EXISTS idx_abuse_events_created_at ON abuse_events(created_at);

