# Haliwali — VPS production deployment checklist

This guide prepares a **safe single-node VPS** deployment without changing application logic.  
Chat, moderation reports, and admin sessions remain **file-backed** until a future migration.

---

## 1. Prerequisites

| Requirement | Notes |
|------------|--------|
| **OS** | Linux (typical VPS) with SSH |
| **Node.js** | LTS version matching local development (see `package.json` / Volta if used) |
| **pnpm** | Install globally or use `corepack enable` |
| **PostgreSQL** | 14+ recommended; database and role created in advance |
| **Reverse proxy** | Nginx or Caddy in front of Node (TLS termination, `X-Forwarded-*`) |

---

## 2. Environment variables

Copy `.env.production.example` to `.env.production` on the server and fill secrets.

**Required for production**

- **`DATABASE_URL`** — PostgreSQL connection string. The app expects this when `NODE_ENV=production`; session and listing APIs depend on it.
- **`NEXT_PUBLIC_SITE_URL`** — Public site origin (no trailing slash), e.g. `https://haliwali.ru`. Drives metadata, `robots.txt` Sitemap line, and canonical URLs (`app/lib/siteUrl.ts`).

**Strongly recommended**

- **`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`** — Location picker / map. Restrict key by HTTP Referer in Yandex developer settings.
- **`ADMIN_PASSWORD`** — `/admin` login (or use `.data/admin-login-override.txt`; back up `.data` if you use the file).
- **`HALIWALI_ADMIN_USER_IDS`** — Space/comma-separated user IDs who may use privileged admin APIs together with `admin_session` (see `app/lib/serverAdminSession.ts`). Safer than relying on the admin cookie alone.

**Do not enable in production**

- `DEBUG_AUTH`, `NEXT_PUBLIC_DEBUG_AUTH`, `DEV_SHOW_OTP_CODES`

Optional SMS/email keys: see `.env.production.example`.

---

## 3. PostgreSQL setup

1. Create role and database (example):

   ```bash
   sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
   CREATE ROLE haliwali LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
   CREATE DATABASE haliwali OWNER haliwali;
   SQL
   ```

2. Use a **dedicated least-privilege** role for the app if your policy requires it (the app needs DDL only during migrations you run as admin).

3. Set `DATABASE_URL`, e.g.:

   `postgresql://haliwali:REPLACE_WITH_STRONG_PASSWORD@127.0.0.1:5432/haliwali`

4. **Connection security:** Prefer local socket or private network; enable SSL to the DB if the database is not on localhost.

---

## 4. SQL apply order

Run from the **repository root** with `ON_ERROR_STOP` so failures halt the script chain.

**Base schema (always first):**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```

**Migrations — apply in this order** (chronological / dependency-safe):

| Order | File |
|-------|------|
| 1 | `db/migrations/002_account_deletion.sql` |
| 2 | `db/migrations/20260501_listing_author_public_name.sql` |
| 3 | `db/migrations/20260502_listing_soft_delete.sql` |

> **Note:** `db/schema.sql` already includes several columns (e.g. user deletion fields, `author_public_name` on `listings`). The migration files use `IF NOT EXISTS` / are idempotent where possible; running them after `schema.sql` is safe for a **fresh** database and **required** for upgrading older databases.

**One-shot chain (bash):**

```bash
export DATABASE_URL="postgresql://..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_account_deletion.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260501_listing_author_public_name.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260502_listing_soft_delete.sql
```

Optional legacy data import (only if you have `.data/ads.json`): see `scripts/import-ads-json-to-pg.mjs` and `docs/postgres-auth.md`.

---

## 5. `.data` directory — persistence and backup

The repository `.gitignores` `.data/`. On the VPS, **create the app user-owned directory** and **back it up regularly** (even when `DATABASE_URL` is set).

### Must back up (current file-backed state)

These paths are **relative to the application working directory** (project root where `next start` runs):

| Path | Purpose |
|------|---------|
| `.data/admin-sessions.json` | Admin login sessions |
| `.data/admin-login-rate.json` | Admin login rate limiting |
| `.data/admin-login-override.txt` | Optional admin password override |
| `.data/admin-user-blocks.json` | User moderation blocks |
| `.data/listing-conversations.json` | Server-side listing chats |
| `.data/reports.jsonl` | User reports / complaints |
| `.data/reply-stats.json` | Fast-reply eligibility stats |
| `.data/listing-views.json` | View counts |
| `.data/listing-view-dedup.json` | View deduplication |
| `.data/support-tickets.json` | Support tickets |
| `.data/calls.json` | Call state (if feature used) |
| `.data/registration-requests.json` | Registration pending (SMS/email flows may still reference files alongside PG) |
| `.data/registration-rate.json` | Registration rate limits |
| `.data/registration-ip-rate.json` | Registration IP rate limits |
| `.data/sms-codes.json`, `.data/sms-rate.json`, `.data/code-ip-rate.json` | OTP / SMS rate limits |
| `.data/profile-phone-*.json`, `.data/profile-phone-owners.json` | Phone verification flows |
| `.data/verified-phones.json` | Verified phone index |
| `.data/chat-message-registry.json`, `.data/chat-message-deletions.json` | Chat message bookkeeping |
| `.data/suspicious-activity.log.jsonl` | Abuse log |

### Optional / fallback files

When PostgreSQL is configured, **users**, **sessions**, and **listings** primary stores are in the database; these JSON paths may not exist or matter long-term:

- `.data/verified-users.json`, `.data/sessions.json`, `.data/listings.json`

Still keep **backups until** you have verified production only uses PostgreSQL for those concerns.

### Uploads

- **`public/uploads/`** — User images (not under `.data`). Back up with the same schedule as `.data` if you serve uploads from disk.

---

## 6. Build and run

From the cloned repository on the server:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm run build
NODE_ENV=production pnpm start
```

Bind to `127.0.0.1` behind a reverse proxy, or set `HOSTNAME` / `PORT` as supported by your Next.js version. Example:

```bash
PORT=3000 HOSTNAME=127.0.0.1 NODE_ENV=production pnpm start
```

Use **systemd**, **PM2**, or similar to restart on failure and on reboot.

---

## 7. Smoke tests (post-deploy)

Replace `BASE` with your public URL (or `http://127.0.0.1:3000` for localhost checks behind SSH).

**Build-time / CI**

```bash
pnpm exec tsc --noEmit
pnpm run build
```

**Runtime HTTP** (expect **200**; `api/listings` returns JSON):

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "BASE/api/listings"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "BASE/robots.txt"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "BASE/sitemap.xml"
```

Quick content checks:

```bash
curl -sS "BASE/robots.txt" | head
curl -sS "BASE/sitemap.xml" | head
curl -sS "BASE/api/listings" | head -c 200
echo
```

---

## 8. Security checklist (operational)

- [ ] TLS certificate valid (Let's Encrypt or provider)
- [ ] Firewall: only 80/443 public; PostgreSQL not exposed publicly unless required
- [ ] `ADMIN_PASSWORD` strong; admin UI not exposed beyond VPN/IP allowlist if possible
- [ ] `HALIWALI_ADMIN_USER_IDS` set for production admin privilege model
- [ ] Yandex Maps API key restricted by referrer
- [ ] Off-site or automated backups for **PostgreSQL** + **`.data`** + **`public/uploads`**

---

## 9. Files added for deployment

| File | Purpose |
|------|--------|
| `.env.production.example` | Variable checklist and safe defaults template |
| `DEPLOY_VPS.md` | This document |

No application business logic was changed for this deployment guide.
