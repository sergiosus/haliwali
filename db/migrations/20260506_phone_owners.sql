-- Phone ownership mapping (phone -> user_id)

CREATE TABLE IF NOT EXISTS phone_owners (
  phone TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Redundant with PRIMARY KEY but kept per spec.
CREATE UNIQUE INDEX IF NOT EXISTS ux_phone_owners_phone ON phone_owners(phone);
CREATE INDEX IF NOT EXISTS idx_phone_owners_user_id ON phone_owners(user_id);

