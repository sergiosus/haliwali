import { NextResponse } from "next/server";
import { siteUrl } from "../lib/siteUrl";

/** Canonical robots rules for public indexing. */
function buildRobotsTxt(): string {
  const base = siteUrl();
  return `User-agent: *
Allow: /

Disallow: /admin
Disallow: /api
Disallow: /profile

Sitemap: ${base}/sitemap.xml
`;
}

export async function GET() {
  return new NextResponse(buildRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
