# SEO Report — After Implementation

**Date:** 2026-05-30  
**Build:** `npm run build` — passed

---

## What already existed (kept)

- Dynamic `robots.txt` with sitemap URL and crawl rules
- Sitemap index + static, categories, cities, companies, listings, catalog child sitemaps
- Root metadata: title, `metadataBase`, canonical `/`, Open Graph, Twitter
- Listing pages: `generateMetadata`, Product/ClassifiedAd JSON-LD, canonical slug URLs
- Company & SEO hub pages: metadata, canonicals, LocalBusiness / Breadcrumb / ItemList JSON-LD
- Catalog section metadata and canonicals
- Source offers public list at `/catalogs/predlozheniya` with static metadata
- `noindex` on missing private listings/companies
- Apex canonical host (`https://haliwali.ru`) via `siteUrl()`

---

## What changed

### A. robots.txt (`app/robots.txt/route.ts`)

- Simplified to spec: `Allow: /`, `Disallow: /admin`, `/api`, `/profile`, `Sitemap: …/sitemap.xml`
- Removed extra Allow lines, Host, and extended Disallow list (login/chat still blocked by app auth, not robots)

### B. Dynamic sitemap

- New `app/sitemap-source-offers.xml/route.ts`
- `buildSourceOfferSitemapUrls()` + index entry in `seoSitemapUrls.ts`
- `pgListPublishedSourceOfferIdsForSitemap()` — paginated published offers only (validated public rows)
- Excludes drafts/candidates (never queried from `catalog_source_offers`)

### C. Metadata

- **Homepage** (`app/layout.tsx`): description → «Каталог компаний, предложений и объявлений.» (OG/Twitter aligned)
- **Listings** (`app/listing/[id]/layout.tsx`): title → `{title} — {city} | Haliwali` when city present
- **Source offer detail** (`app/catalogs/predlozheniya/[id]/page.tsx`): full title/description/OG/Twitter
- **Search** (`app/search/page.tsx`): default title/description + canonical
- **Source offers list** (`app/catalogs/predlozheniya/page.tsx`): `generateMetadata` with filter-aware robots

### D. Canonical URLs

- `/search` → `https://haliwali.ru/search`
- `/catalogs/predlozheniya/[id]` → per-offer canonical
- Filtered list/search keep list canonical but `noindex,follow`

### E. Structured data

- **WebSite** + SearchAction: `WebSiteJsonLd` in root layout
- **Offer** + **BreadcrumbList** on source offer detail pages (`seoSchema.ts`: `websiteJsonLd`, `sourceOfferJsonLd`, `sourceOfferBreadcrumbs`)

### F. Source offers indexing

- Only `catalog_source_offers` (published) in sitemap and detail SSR
- Candidates/drafts never exposed

### G. Search / filtered list

- `app/lib/seoIndexability.ts`: `searchPageHasFilters`, `sourceOffersListHasFilters`
- `robots: { index: false, follow: true }` when query/filters/pagination active

### H. Internal linking & images

- Cards link to `/catalogs/predlozheniya/{id}` («Подробнее» + title link)
- Cover images: meaningful `alt`, width/height, lazy on list

### New files

- `app/lib/catalogSourceOfferSeo.ts`
- `app/lib/seoIndexability.ts`
- `app/catalogs/predlozheniya/[id]/page.tsx`
- `app/components/seo/WebSiteJsonLd.tsx`
- `SEO_AUDIT.md`, `SEO_REPORT_AFTER.md`

---

## Still missing / optional follow-ups

| Item | Priority | Notes |
|------|----------|-------|
| Related offers on detail page | Low | No product requirement; would need query by brand/category |
| Open Graph on `/search` and source list | Low | Title/description sufficient for now |
| SSR homepage body | Low | Metadata is SSR; main content still client |
| `/offers/*` URL alias | N/A | Not part of routing; use `/listing/*` and `/catalogs/predlozheniya/*` |
| `lastmod` in sitemap XML | Low | Current urlset has `<loc>` only |
| hreflang | N/A | Single locale (ru) |

---

## Verification checklist

- [x] `npm run build` passes
- [x] `GET /robots.txt` — Allow /, Disallow admin/api/profile, Sitemap line
- [x] `GET /sitemap.xml` — includes `sitemap-source-offers.xml`
- [x] Published offer URL in sitemap: `/catalogs/predlozheniya/{id}`
- [x] Filtered `/search?q=…` → `noindex, follow` in HTML meta
- [x] Filtered `/catalogs/predlozheniya?city=…` → `noindex, follow`
- [ ] Manual: view-source on offer detail for Offer JSON-LD (after deploy + DB with published rows)

---

## Deploy note

No new migration for SEO. Ensure published source offers exist in PostgreSQL for sitemap/detail pages to populate.
