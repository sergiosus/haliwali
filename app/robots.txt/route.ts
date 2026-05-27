import { NextResponse } from "next/server";
import { siteUrl } from "../lib/siteUrl";

/** Canonical robots rules for public indexing. */
function buildRobotsTxt(): string {
  const base = siteUrl();
  return `User-agent: *
Allow: /
Allow: /uslugi/
Allow: /zadachi/
Allow: /tovary/
Allow: /company/
Allow: /catalogs
Allow: /catalogs/
Allow: /map
Disallow: /admin
Disallow: /api
Disallow: /messages
Disallow: /profile
Disallow: /account
Disallow: /chat
Disallow: /login
Disallow: /post
Disallow: /edit
Disallow: /reset-password
Disallow: /users

Host: ${new URL(base).host}
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
