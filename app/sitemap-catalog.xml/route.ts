import { NextResponse } from "next/server";
import { catalogSitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";
import {
  ensureCatalogReady,
  listCatalogCategories,
  listCatalogCompaniesSitemap,
} from "../lib/serverCatalogStore";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureCatalogReady();
  const [categories, companies] = await Promise.all([
    listCatalogCategories().catch(() => []),
    listCatalogCompaniesSitemap().catch(() => []),
  ]);
  return new NextResponse(renderUrlSet(catalogSitemapUrls(categories, companies)), {
    headers: SITEMAP_CACHE_HEADERS,
  });
}
