-- Soft delete / archive lifecycle (orthogonal to moderation status).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_lifecycle TEXT NOT NULL DEFAULT 'live';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS delete_permanently_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS archived_at BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_snapshot JSONB;
