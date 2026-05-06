-- Run once if listings table existed before author_public_name was added.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS author_public_name TEXT NOT NULL DEFAULT '';
