# VPS readiness (MVP → production)

This document captures the current **local-first** storage model and what must change before a serious Russian VPS deployment. It is a companion to `docs/database-migration-plan.md` (deeper store-by-store notes).

## Temporary MVP storage (today)

| Area | What is used | Notes |
|------|----------------|--------|
| Server state | `.data/*.json` | Users, sessions, ads, rate limits, SMS/registration state, etc. — file-based, not durable or horizontally scalable. |
| Browser | `localStorage` | Listings drafts/cache, chat threads, profile UI cache — **not** a source of truth for security or billing. |
| Uploads | `public/uploads/` | On-disk files next to the app; no CDN, no virus pipeline beyond a TODO in upload route. |

## Production requirements (not yet implemented)

1. **PostgreSQL** (or equivalent managed SQL) for durable data: **users**, **listings/ads**, **chats** (if/when moved server-side), and related indices — replacing ad-hoc JSON files.
2. **Object storage** (S3-compatible cloud providers, etc.) for **uploads**, with the app storing URLs and serving via HTTPS — not the local `public/uploads/` tree.
3. **httpOnly, Secure cookies** for session tokens (already the direction for server session APIs); no reliance on client-only identity for protected actions.
4. **No localStorage as source of truth** for data that must be correct across devices or after refresh; use APIs + server persistence.

## JSON user store guard

`readUsersDb` / `writeUsersDb` on paths ending in `verified-users.json` will **throw in `NODE_ENV=production`** until PostgreSQL-backed user storage exists. In development, a **one-time console warning** is logged when that path is used.

## OTP / auth routes (two pairs)

- **Login (existing account):** `POST /api/send-code` + `POST /api/verify-code` — shared SMS/login code store; used by the login “code” tab.
- **Registration (new account):** `POST /api/auth/request-registration-code` + `POST /api/auth/verify-registration-code` — pending registration + password hash; used by the signup form and **resend** during signup.

Do not resend or complete registration through the login pair; see file-level comments on those route modules.

## Checklist before go-live

- [ ] PostgreSQL (or chosen DB) for users and listings
- [ ] Object storage for chat/listing images
- [ ] Secrets in env / secret manager — **not** in the repo (`.env*`, `.data/`, `public/uploads/` are gitignored)
- [ ] Backups and restore tested
- [ ] Rate limits and abuse logs migrated off plain JSON if traffic warrants
