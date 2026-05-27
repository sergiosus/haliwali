import { NextResponse } from "next/server";
import { buildStaticSitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(renderUrlSet(buildStaticSitemapUrls()), { headers: SITEMAP_CACHE_HEADERS });
}
