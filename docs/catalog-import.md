# Catalog import & discovery

## Migrations

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260521_catalogs.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260522_catalog_import_drafts.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260523_catalog_import_v2.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260524_catalog_import_workflow.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260525_catalog_import_status_enum.sql
```

## Admin flow

1. **Discover** — `/admin/catalogs/discover` — multi-query search, relevance score, domain filter
2. **Select URLs** → «В импорт» → drafts created
3. **Review** — `/admin/catalogs/import/drafts` — statuses: draft / saved / approved / rejected / published; publish from approved, merge
4. **Extract** — `/admin/catalogs/import` — URL(s), text/VK, CSV

## Environment

```env
# Search API (required for discover)
SEARCH_PROVIDER=serpapi
SEARCH_API_KEY=
SEARCH_MAX_RESULTS=50
SEARCH_COUNTRY=RU
SEARCH_LANG=ru
SEARCH_REGION_BOOST=true

# Optional
DATAFORSEO_LOGIN=
YANDEX_XML_USER=
```

## Logs (server console)

- `[CATALOG_DISCOVER]` — search batches, ranking
- `[CATALOG_IMPORT]` — batch import
- `[CATALOG_PARSE]` — HTML fetch / extract
- `[CATALOG_PUBLISH]` — publish counts

No API keys or full phone numbers in logs.

## Test steps

```bash
npm run dev
```

1. Set `SEARCH_PROVIDER` + `SEARCH_API_KEY`
2. `/admin/catalogs/discover` — query `авторазборка`, city `Ижевск`, category `auto`
3. Confirm queries list includes localized variants
4. Check relevance scores and source type badges
5. Select 2 URLs → «В импорт» → redirects to drafts
6. Edit draft → Сохранить → Опубликовать (from Сохранённые tab)
7. Open `/catalogs/auto` — company visible
8. Empty category shows «Найти источники» buttons

## Example discover input

- Query: `авторазборка`
- City: `Ижевск`
- Category: `auto`

Built queries include: `авторазборка Ижевск`, `авторазборки Ижевск`, `разбор авто Ижевск`, etc.

## Example CSV

See `docs/catalog-import-example.csv`.
