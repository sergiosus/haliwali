import { NextResponse } from "next/server";
import { categoryToSlug, productCategories, serviceCategories, taskCategories } from "../lib/categories";
import { listingPath } from "../lib/seo";
import { listBootstrap } from "../lib/serverListingsStore";
import { siteUrl } from "../lib/siteUrl";

export const dynamic = "force-dynamic";

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET() {
  const base = siteUrl();
  const urls: string[] = [];

  urls.push(`${base}/`);
  urls.push(`${base}/tasks`);
  urls.push(`${base}/services`);
  urls.push(`${base}/products`);
  urls.push(`${base}/privacy`);
  urls.push(`${base}/terms`);
  urls.push(`${base}/about`);
  urls.push(`${base}/contact`);

  const slugs = new Set<string>();
  for (const t of taskCategories) slugs.add(categoryToSlug(t, "task"));
  for (const t of serviceCategories) slugs.add(categoryToSlug(t, "service"));
  for (const t of productCategories) slugs.add(categoryToSlug(t, "product_sell"));
  for (const slug of slugs) urls.push(`${base}/category/${encodeURIComponent(slug)}`);

  const listings = await listBootstrap(null, false);
  for (const l of listings) {
    const id = (l.id ?? "").trim();
    const title = (l.title ?? "").trim();
    if (!id || !title) continue;
    urls.push(`${base}${listingPath(id, title)}`);
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${xmlEscape(u)}</loc></url>`).join("") +
    `</urlset>`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

