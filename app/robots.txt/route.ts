import { NextResponse } from "next/server";
import { siteUrl } from "../lib/siteUrl";

export async function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /profile
Disallow: /messages
Disallow: /settings
Disallow: /api
Disallow: /login
Disallow: /register

Sitemap: ${siteUrl()}/sitemap.xml
`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

