import { NextResponse } from "next/server";
import { catalogCategoryUrl, catalogCompanyPath, catalogRootUrl } from "../lib/catalogSeo";
import { listingPath } from "../lib/seo";
import {
  ensureCatalogReady,
  listCatalogCategories,
  listCatalogCompaniesSitemap,
} from "../lib/serverCatalogStore";
import { listBootstrap } from "../lib/serverListingsStore";
import { siteUrl } from "../lib/siteUrl";

export const dynamic = "force-dynamic";

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET() {
  const base = siteUrl();
  const urls = new Set<string>();

  urls.add(`${base}/`);
  urls.add(`${base}/tasks`);
  urls.add(`${base}/services`);
  urls.add(`${base}/products`);
  urls.add(`${base}/privacy`);
  urls.add(`${base}/terms`);
  urls.add(`${base}/about`);
  urls.add(`${base}/contact`);
  urls.add(catalogRootUrl());

  await ensureCatalogReady();
  const categories = await listCatalogCategories().catch(() => []);
  for (const category of categories) {
    urls.add(catalogCategoryUrl(category.slug));
  }

  const companies = await listCatalogCompaniesSitemap().catch(() => []);
  for (const company of companies) {
    urls.add(`${base}${catalogCompanyPath(company)}`);
  }

  const listings = await listBootstrap(null, false);
  for (const l of listings) {
    const id = (l.id ?? "").trim();
    const title = (l.title ?? "").trim();
    if (!id || !title) continue;
    urls.add(`${base}${listingPath(id, title)}`);
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    [...urls].map((u) => `<url><loc>${xmlEscape(u)}</loc></url>`).join("") +
    `</urlset>`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

