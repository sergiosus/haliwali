## Database migration plan (VPS production readiness)

Haliwali currently uses file-backed JSON stores in `.data/*.json` for server-side state. This is acceptable for a prototype but **not production-safe** for a VPS launch (concurrency, integrity, backup/restore, observability, access control).

This document describes a DB-ready architecture and a safe migration plan.

### Recommended database
- **PostgreSQL** (single primary, daily backups, WAL archiving if possible)
- Migration tooling: **Prisma** or **Drizzle** (choose one), plus one-time import scripts.

### Current `.data/*.json` stores to migrate
- **users**: `.data/verified-users.json`
- **sessions**: `.data/sessions.json`
- **admin sessions**: `.data/admin-sessions.json`
- **admin login rate**: `.data/admin-login-rate.json`
- **ads mirror**: `.data/ads.json` (server mirror for public ad previews / counts)
- **calls**: `.data/calls.json`
- **registration requests**: `.data/registration-requests.json`
- **registration rate**: `.data/registration-rate.json`, `.data/registration-ip-rate.json`
- **OTP codes & rate limits**:
  - `.data/sms-codes.json`, `.data/sms-rate.json`
  - `.data/code-ip-rate.json`
  - `.data/profile-phone-codes.json`, `.data/profile-phone-rate.json`, `.data/profile-phone-owners.json`
  - `.data/verified-phones.json`
- **abuse / audit logs**: `.data/suspicious-activity.log.jsonl`

Notes:
- Chat messages and listings are currently **client-localStorage** based in this MVP. For production, they should be moved server-side too (see tables below).

---

## Proposed schema (PostgreSQL)

### `users`
- `id` (text/uuid, pk)
- `email` (citext, unique, nullable)
- `phone` (text, unique, nullable) — stored **privately**
- `phone_visible` (bool, default false)
- `password_hash` (text, not null)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Indexes**
- unique(email) where email is not null
- unique(phone) where phone is not null

**Privacy**
- Never return `email`, `phone`, `password_hash` from public endpoints.

### `sessions`
- `token` (text, pk) — random
- `user_id` (fk users.id)
- `created_at` (timestamptz)
- `expires_at` (timestamptz)

**Indexes**
- index(user_id)
- index(expires_at)

### `admin_sessions`
- `token` (text, pk)
- `created_at` (timestamptz)
- `expires_at` (timestamptz)
- `last_ip` (inet, nullable)

### `rate_limits`
Generic bucket store (instead of many JSON files).
- `key` (text, pk) — e.g. `sms:ip:1.2.3.4`, `reg:email:u***@d.ru`
- `window_start` (timestamptz)
- `count` (int)
- `updated_at` (timestamptz)

### `audit_logs`
Replace `.jsonl` file with structured logs.
- `id` (bigserial pk)
- `type` (text)
- `ip` (inet, nullable)
- `actor_user_id` (fk users.id, nullable)
- `masked_identifier` (text, nullable) — store masked/hashes only (no raw phone/email)
- `payload` (jsonb)
- `created_at` (timestamptz)

### `phone_verifications`
For OTP ownership + anti-fraud.
- `id` (bigserial pk)
- `user_id` (fk users.id)
- `phone` (text)
- `verified_at` (timestamptz)
- `status` (text: verified/revoked)

### `listings`
(Production-ready server listings)
- `id` (text/uuid pk)
- `owner_id` (fk users.id)
- `type` (text) — task/service/product_sell/product_buy
- `status` (text)
- `title` (text)
- `description` (text)
- `category_name` (text)
- `category_slug` (text, index)
- `city` (text, index)
- `price` (numeric, nullable)
- `photos` (jsonb or separate table)
- `created_at` / `updated_at`

### `chats`
- `id` (uuid pk)
- `listing_id` (fk listings.id)
- `participant_a` (fk users.id)
- `participant_b` (fk users.id)
- `created_at`

**Index**
- unique(listing_id, participant_a, participant_b) with canonical ordering

### `chat_messages`
- `id` (uuid pk)
- `chat_id` (fk chats.id, index)
- `sender_id` (fk users.id, index)
- `type` (text: text/file)
- `text` (text, nullable)
- `file_id` (fk chat_files.id, nullable)
- `reply_to_message_id` (uuid, nullable)
- `edited_at` (timestamptz, nullable)
- `created_at` (timestamptz)

### `chat_files`
- `id` (uuid pk)
- `chat_id` (fk chats.id)
- `uploader_id` (fk users.id)
- `storage_key` (text) — random name on disk/object storage
- `mime` (text)
- `size_bytes` (int)
- `created_at`

### `calls`
- `id` (uuid pk)
- `chat_id` (fk chats.id)
- `room_token` (uuid/text, unique) — **non-guessable**
- `caller_id` (fk users.id)
- `status` (pending/active/ended/declined/missed)
- `created_at`
- `expires_at`
- `ended_at` (nullable)

---

## Backup strategy
- Nightly `pg_dump` + weekly full snapshot
- Store backups encrypted, off-instance (S3-compatible or another VPS)
- Regular restore test (at least monthly)
- Keep WAL archiving if feasible

---

## Migration steps (JSON → PostgreSQL)
1. **Introduce DB layer** (new repository/service modules) while keeping JSON stores as the source of truth.
2. **Add dual-write** for server state (sessions, calls, users) behind a feature flag.
3. **Backfill**:
   - Import users (`verified-users.json`) first.
   - Import sessions/admin sessions.
   - Import calls.
   - Import ads mirror if still needed.
4. **Switch reads** to DB (one subsystem at a time).
5. **Disable JSON writes** and keep JSON as fallback read-only for a short rollback window.
6. **Remove JSON stores** after stability period and confirmed backups.

### Rollback plan
- Feature flag to revert reads/writes back to JSON.
- Keep JSON snapshots of stores before cutover.
- Keep DB migrations reversible (down migrations) where possible.

