import { NextResponse } from "next/server";
import { buildCitySitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";
import { listBootstrap } from "../lib/serverListingsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const listings = await listBootstrap(null, false);
  return new NextResponse(renderUrlSet(buildCitySitemapUrls(listings)), { headers: SITEMAP_CACHE_HEADERS });
}
