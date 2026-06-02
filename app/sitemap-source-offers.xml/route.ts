import { NextResponse } from "next/server";
import { buildSourceOfferSitemapUrls } from "../lib/seoSitemapUrls";
import { listPublishedSourceOfferIdsForSitemap } from "../lib/serverCatalogSourceOfferStore";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";

export const dynamic = "force-dynamic";

export async function GET() {
  let urls: string[] = [];
  try {
    const ids = await listPublishedSourceOfferIdsForSitemap();
    urls = buildSourceOfferSitemapUrls(ids);
  } catch {
    urls = [];
  }
  return new NextResponse(renderUrlSet(urls), { headers: SITEMAP_CACHE_HEADERS });
}
