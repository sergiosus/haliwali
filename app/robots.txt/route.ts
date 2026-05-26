import { NextResponse } from "next/server";

/** Canonical robots rules for public indexing. Catalog and company pages are explicitly crawlable. */
const ROBOTS_TXT = `User-agent: *
Allow: /
Allow: /catalogs
Allow: /catalogs/
Allow: /company/
Disallow: /admin
Disallow: /api

Host: haliwali.ru
Sitemap: https://haliwali.ru/sitemap.xml
`;

export async function GET() {
  return new NextResponse(ROBOTS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
