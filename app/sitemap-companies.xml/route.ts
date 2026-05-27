import { NextResponse } from "next/server";
import { buildCompanySitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";
import { ensureCatalogReady, listCatalogCompaniesSitemap } from "../lib/serverCatalogStore";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureCatalogReady();
  const companies = await listCatalogCompaniesSitemap().catch(() => []);
  return new NextResponse(renderUrlSet(buildCompanySitemapUrls(companies)), { headers: SITEMAP_CACHE_HEADERS });
}
