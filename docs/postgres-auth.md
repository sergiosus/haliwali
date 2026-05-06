# PostgreSQL authentication

When `DATABASE_URL` is set, the app stores **users**, **auth sessions**, and **registration pending** rows in PostgreSQL instead of `.data/verified-users.json`, `.data/sessions.json`, and `registration-requests.json`.

## Requirements

- **Production (`NODE_ENV=production`):** `DATABASE_URL` is **required**. The server throws a clear error if it is missing when auth storage is accessed.
- **Local JSON mode:** Omit `DATABASE_URL` (and use `NODE_ENV=development`). The previous JSON files are still used; a console warning appears once for `verified-users.json`.

## Schema

Apply the SQL in `db/schema.sql`:

```bash
# Local (psql installed)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```

On a VPS, run the same command after creating a database and user with limited privileges.

## Tables

| Table | Purpose |
|-------|---------|
| `users` | Account records (`user_id`, normalized `email`/`phone`, `password_hash`, `phone_visible`, timestamps). |
| `auth_sessions` | Opaque session tokens (`token` → `user_id`, `expires_at`). httpOnly cookies reference `token`. |
| `registration_pending` | Signup-in-progress rows (hashed password, hashed email OTP for email flow, SMS uses existing JSON SMS stores). |
| `listings` | Marketplace listings when using PostgreSQL (`DATABASE_URL` set). Without `DATABASE_URL`, listings fall back to `.data/listings.json`. Legacy `.data/ads.json` is not used at runtime. |

### Migrating legacy `ads.json` into PostgreSQL

After applying `db/schema.sql`, run:

```bash
node scripts/import-ads-json-to-pg.mjs
```

Requires `DATABASE_URL` and a populated `.data/ads.json`. Imported rows use placeholder descriptions where missing.

## Sessions & cookies

- Cookies remain **httpOnly**, **sameSite: lax**, **secure** when `NODE_ENV=production`.
- Session secrets are **not** embedded in the browser; tokens are random and stored server-side (PostgreSQL or JSON fallback).

## Migrating existing JSON users

There is no automatic importer in-repo. Export `verified-users.json` and insert into `users` with a one-off script or `COPY`. Preserve `user_id` values so existing URLs and sessions remain consistent (sessions still need re-login after switching stores).

## OTP / rate limits

- Login and registration OTP **rate limits** still use JSON files under `.data/` (IP/account windows).
- **DEV_SHOW_OTP_CODES** only applies when `NODE_ENV !== "production"` (see `app/lib/devRegistrationOtp.ts`).

## Remaining JSON stores

SMS codes, registration **per-identifier** rate file, ads, trust stats, etc. remain file-based until separately migrated (see `docs/database-migration-plan.md`).
