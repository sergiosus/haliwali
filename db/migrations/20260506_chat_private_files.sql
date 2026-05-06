-- Private chat file metadata (binary files remain on disk for now)

CREATE TABLE IF NOT EXISTS chat_private_files (
  file_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  original_name TEXT NULL,
  stored_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes BIGINT NULL,
  storage_path TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_private_files_chat_id ON chat_private_files(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_private_files_uploaded_by ON chat_private_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_chat_private_files_created_at ON chat_private_files(created_at);

