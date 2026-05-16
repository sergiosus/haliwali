-- Repair / ensure abuse + SMS rate-limit schema for serverAbuse.ts and serverSms.ts (additive, idempotent)
-- Required by checkScopedRateLimitPg: abuse_rate_limits(scope, key, attempts, first_attempt_at, last_attempt_at, blocked_until)

CREATE TABLE IF NOT EXISTS sms_codes (
  key TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sms_codes_target ON sms_codes (target);
CREATE INDEX IF NOT EXISTS idx_sms_codes_purpose ON sms_codes (purpose);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires_at ON sms_codes (expires_at);

CREATE TABLE IF NOT EXISTS sms_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_last_attempt_at ON sms_rate_limits (last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_blocked_until ON sms_rate_limits (blocked_until);

CREATE TABLE IF NOT EXISTS abuse_rate_limits (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  blocked_until TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_scope ON abuse_rate_limits (scope);
CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_last_attempt_at ON abuse_rate_limits (last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_blocked_until ON abuse_rate_limits (blocked_until);

CREATE TABLE IF NOT EXISTS abuse_events (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_events_scope ON abuse_events (scope);
CREATE INDEX IF NOT EXISTS idx_abuse_events_key ON abuse_events (key);
CREATE INDEX IF NOT EXISTS idx_abuse_events_event_type ON abuse_events (event_type);
CREATE INDEX IF NOT EXISTS idx_abuse_events_created_at ON abuse_events (created_at);

-- Legacy/partial DBs: add columns if an older table existed without them
ALTER TABLE abuse_rate_limits ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE abuse_rate_limits ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE abuse_rate_limits ADD COLUMN IF NOT EXISTS first_attempt_at TIMESTAMP;
ALTER TABLE abuse_rate_limits ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
ALTER TABLE abuse_rate_limits ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMP NULL;

UPDATE abuse_rate_limits
SET scope = COALESCE(NULLIF(TRIM(scope), ''), 'legacy')
WHERE scope IS NULL OR TRIM(scope) = '';

UPDATE abuse_rate_limits
SET attempts = COALESCE(attempts, 0),
    first_attempt_at = COALESCE(first_attempt_at, last_attempt_at, now()),
    last_attempt_at = COALESCE(last_attempt_at, first_attempt_at, now())
WHERE first_attempt_at IS NULL OR last_attempt_at IS NULL;

ALTER TABLE abuse_rate_limits ALTER COLUMN scope SET NOT NULL;
ALTER TABLE abuse_rate_limits ALTER COLUMN attempts SET NOT NULL;
ALTER TABLE abuse_rate_limits ALTER COLUMN attempts SET DEFAULT 0;
ALTER TABLE abuse_rate_limits ALTER COLUMN first_attempt_at SET NOT NULL;
ALTER TABLE abuse_rate_limits ALTER COLUMN last_attempt_at SET NOT NULL;

ALTER TABLE sms_rate_limits ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sms_rate_limits ADD COLUMN IF NOT EXISTS first_attempt_at TIMESTAMP;
ALTER TABLE sms_rate_limits ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
ALTER TABLE sms_rate_limits ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMP NULL;

UPDATE sms_rate_limits
SET attempts = COALESCE(attempts, 0),
    first_attempt_at = COALESCE(first_attempt_at, last_attempt_at, now()),
    last_attempt_at = COALESCE(last_attempt_at, first_attempt_at, now())
WHERE first_attempt_at IS NULL OR last_attempt_at IS NULL;

ALTER TABLE sms_rate_limits ALTER COLUMN attempts SET NOT NULL;
ALTER TABLE sms_rate_limits ALTER COLUMN attempts SET DEFAULT 0;
ALTER TABLE sms_rate_limits ALTER COLUMN first_attempt_at SET NOT NULL;
ALTER TABLE sms_rate_limits ALTER COLUMN last_attempt_at SET NOT NULL;

ALTER TABLE abuse_events ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE abuse_events ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE abuse_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE abuse_events ADD COLUMN IF NOT EXISTS payload_json TEXT;
ALTER TABLE abuse_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();

UPDATE abuse_events
SET scope = COALESCE(NULLIF(TRIM(scope), ''), 'legacy'),
    key = COALESCE(NULLIF(TRIM(key), ''), 'unknown'),
    event_type = COALESCE(NULLIF(TRIM(event_type), ''), 'suspicious')
WHERE scope IS NULL OR TRIM(scope) = '' OR key IS NULL OR TRIM(key) = '' OR event_type IS NULL OR TRIM(event_type) = '';

ALTER TABLE abuse_events ALTER COLUMN scope SET NOT NULL;
ALTER TABLE abuse_events ALTER COLUMN key SET NOT NULL;
ALTER TABLE abuse_events ALTER COLUMN event_type SET NOT NULL;
