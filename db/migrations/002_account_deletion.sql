-- Account deletion: pending grace period + finalized anonymized state
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_account_deletion.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_status TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_requested_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_scheduled_at BIGINT;
