import { NextResponse } from "next/server";

/** Canonical robots rules for Yandex/Google (see Yandex Webmaster allow/disallow docs). */
const ROBOTS_TXT = `User-agent: Yandex
Allow: /$
Allow: /
Allow: /search
Allow: /category/
Allow: /listing/
Allow: /tasks
Allow: /services
Allow: /products
Allow: /about
Allow: /contact
Allow: /privacy
Allow: /terms
Disallow: /admin
Disallow: /api
Disallow: /login
Disallow: /reset-password
Disallow: /profile
Disallow: /chat
User-agent: Googlebot
Allow: /$
Allow: /
Allow: /search
Allow: /category/
Allow: /listing/
Allow: /tasks
Allow: /services
Allow: /products
Allow: /about
Allow: /contact
Allow: /privacy
Allow: /terms
Disallow: /admin
Disallow: /api
Disallow: /login
Disallow: /reset-password
Disallow: /profile
Disallow: /chat
User-agent: *
Allow: /$
Allow: /
Allow: /search
Allow: /category/
Allow: /listing/
Allow: /tasks
Allow: /services
Allow: /products
Allow: /about
Allow: /contact
Allow: /privacy
Allow: /terms
Disallow: /admin
Disallow: /api
Disallow: /login
Disallow: /reset-password
Disallow: /profile
Disallow: /chat

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
