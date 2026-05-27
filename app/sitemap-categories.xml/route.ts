import { NextResponse } from "next/server";
import { buildCategorySitemapUrls } from "../lib/seoSitemapUrls";
import { renderUrlSet, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(renderUrlSet(buildCategorySitemapUrls()), { headers: SITEMAP_CACHE_HEADERS });
}
