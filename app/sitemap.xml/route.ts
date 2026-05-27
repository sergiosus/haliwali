import { NextResponse } from "next/server";
import { buildSitemapIndexEntries } from "../lib/seoSitemapUrls";
import { renderSitemapIndex, SITEMAP_CACHE_HEADERS } from "../lib/sitemapXml";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = renderSitemapIndex(buildSitemapIndexEntries());
  return new NextResponse(body, { headers: SITEMAP_CACHE_HEADERS });
}
