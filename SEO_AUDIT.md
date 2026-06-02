# SEO Audit — Haliwali

**Date:** 2026-05-30  
**Scope:** Public indexing, metadata, sitemaps, structured data, SSR, internal links.  
**Out of scope:** Auth, chat, admin moderation logic, core business rules.

---

## 1. robots.txt

| Check | Status | Notes |
|-------|--------|-------|
| Exists | ✅ | Dynamic route `app/robots.txt/route.ts` |
| Allows indexing of public site | ✅ | `Allow: /` |
| Blocks sensitive areas | ✅ | `/admin`, `/api`, `/profile` (plus previously extra paths; simplified per spec) |
| Sitemap reference | ✅ | `Sitemap: https://haliwali.ru/sitemap.xml` (via `siteUrl()`) |

**Gap (before fix):** Extra `Allow:` lines and `Host:` directive; many `Disallow` paths beyond spec.

---

## 2. Sitemap

| Check | Status | Notes |
|-------|--------|-------|
| Exists | ✅ | `app/sitemap.xml/route.ts` (index) |
| Dynamic | ✅ | Child sitemaps generated at request time |
| `/` | ✅ | `sitemap-static.xml` |
| Companies | ✅ | `sitemap-companies.xml`, `sitemap-catalog.xml` |
| Catalog categories | ✅ | `sitemap-catalog.xml` |
| Native listings (`/listing/*`) | ✅ | `sitemap-listings.xml` |
| SEO categories/cities | ✅ | `sitemap-categories.xml`, `sitemap-cities.xml` |
| Published source offers | ⚠️ → ✅ | **Was missing** per-offer URLs; list page only in static sitemap |
| `/offers/*`, `/source-offers/*` | N/A | Routes not used; canonical paths are `/listing/*` and `/catalogs/predlozheniya/*` |
| Excludes admin/drafts | ✅ | Only public store/listing queries |
| Excludes filtered search | ✅ | `/search` not in sitemap |
| Auto regeneration | ✅ | `force-dynamic` + hourly cache headers |

---

## 3. Metadata

| Page | title | description | openGraph | twitter |
|------|-------|-------------|-----------|---------|
| Root `app/layout.tsx` | ✅ | ⚠️ → ✅ | ✅ | ✅ |
| Homepage (`app/page.tsx`) | Inherits root | Inherits root | Inherits | Inherits |
| Listings `listing/[id]/layout.tsx` | ⚠️ → ✅ | ✅ | ✅ | ✅ |
| Companies `company/[slug]` | ✅ | ✅ | ✅ | — |
| Catalog companies/categories | ✅ | ✅ | partial | — |
| Source offers list | ✅ | ✅ | — | — |
| Source offer detail | ❌ → ✅ | New route | ✅ | ✅ |
| `/search` | ❌ → ✅ | New `generateMetadata` | — | — |
| SEO category/city pages | ✅ | ✅ | — | — |

**Homepage description (spec):** «Каталог компаний, предложений и объявлений.» — was longer marketing copy.

**Offer title format (spec):** `{title} — {city} | Haliwali` — listings lacked city; source offers had no detail page metadata.

---

## 4. Canonical URLs

| Area | Status |
|------|--------|
| Root `/` | ✅ `alternates.canonical` |
| SEO category/city | ✅ |
| Companies (public + catalog) | ✅ |
| Listings | ✅ slug path |
| Catalog list pages | ✅ |
| Source offers list | ✅ |
| Source offer detail | ❌ → ✅ |
| `/search` | ❌ → ✅ |

No canonical loops observed (apex host via `siteUrl()` / `metadataBase`).

---

## 5. Public offer pages (source + native)

### Native listings (`/listing/[id]-slug`)

| Check | Status |
|-------|--------|
| Unique URL | ✅ |
| H1 (in client page) | ✅ |
| Title meta | ✅ (city added) |
| Description meta | ✅ |

### Source offers (`/catalogs/predlozheniya`)

| Check | Status |
|-------|--------|
| Unique URL | ⚠️ Hash `#offer-{id}` only → ✅ `/catalogs/predlozheniya/[id]` |
| H1 | List page only → ✅ on detail |
| Title / description | ❌ → ✅ `generateMetadata` on detail |

---

## 6. SSR / rendering

| Route | Rendering | SEO impact |
|-------|-----------|------------|
| Homepage | Client (`HomePageClient`) | Metadata from root layout (SSR) |
| `/search` | Client + SSR metadata | ✅ noindex when filtered |
| Listings | Client page + SSR layout metadata + JSON-LD | ✅ |
| Source offers list | Client fetch + SSR metadata | ✅ noindex when filtered |
| Source offer detail | **Server** | ✅ full HTML for bots |

---

## 7. Structured data (JSON-LD)

| Type | Status | Where |
|------|--------|-------|
| WebSite | ❌ → ✅ | Root layout |
| Organization | ✅ | Company pages |
| BreadcrumbList | ✅ | SEO pages, companies, source offer detail |
| Product / ClassifiedAd | ✅ | Listing layout |
| Offer (source) | ❌ → ✅ | Source offer detail |
| ItemList | ✅ | Category/city SEO pages |

---

## 8. Indexability

| Check | Status |
|-------|--------|
| Private listing/company | `noindex` |
| `/search` with filters | ❌ → ✅ `noindex, follow` |
| `/catalogs/predlozheniya` with filters | ❌ → ✅ `noindex, follow` |
| Admin / API | robots Disallow |
| Draft/candidate source offers | Not in public API or sitemap |
| Canonical loops | None found |

---

## 9. Internal linking

| Link | Status |
|------|--------|
| Catalog → source offer detail | ❌ → ✅ card title + «Подробнее» |
| Offer → external source | ✅ |
| List → all offers | ✅ detail page |
| Related offers | ⚠️ Not implemented (optional) |
| SEO «Часто ищут» | ✅ |
| Map / category hubs | ✅ |

---

## 10. Image SEO

| Check | Status |
|-------|--------|
| `alt` on source offer thumbs | ⚠️ empty → ✅ title |
| Dimensions | ⚠️ → ✅ width/height on thumbs |
| Lazy loading | ✅ list; eager on detail hero |
| Listing photos | Client-rendered (existing) |

---

## Summary of gaps addressed in implementation

1. Simpler `robots.txt` per spec  
2. `sitemap-source-offers.xml` for published offers  
3. Homepage description + WebSite JSON-LD  
4. Listing title with city  
5. Source offer detail pages with metadata, canonical, Offer + Breadcrumb JSON-LD  
6. `noindex,follow` for filtered search and source-offer list  
7. Internal links catalog card → detail  
8. Image `alt` + dimensions on source offer images  

## Intentionally unchanged

- Auth, chat, moderation workflows  
- Client-side homepage/search listing UI (metadata handled server-side)  
- Native listing page remains client-rendered (existing JSON-LD in layout)  
- Related-offers block (not present in product)
