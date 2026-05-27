import { NextResponse } from "next/server";
import { buildListingSitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";
import { listBootstrap } from "../lib/serverListingsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const listings = await listBootstrap(null, false);
  return new NextResponse(renderUrlSet(buildListingSitemapUrls(listings)), { headers: SITEMAP_CACHE_HEADERS });
}
