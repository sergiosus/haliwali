import { CATALOG_SOURCE_NAME_LABEL } from "./catalogSourceName";
import { isValidPublishedSourceOffer, inputFromSourceOfferFields } from "./catalogSourceOfferValidation";
import {
  parseCatalogSourceName,
  type CatalogSourceName,
  type CatalogSourceOffer,
} from "./catalogSourceOfferTypes";

export type CatalogSourceOfferListQuery = {
  q?: string;
  categorySlug?: string;
  city?: string;
  sourceName?: CatalogSourceName;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
};

export function parseOfferPriceRub(price: string | null | undefined): number | null {
  if (!price?.trim()) return null;
  const digits = price.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function offerMatchesTextQuery(offer: CatalogSourceOffer, rawQ: string): boolean {
  const q = norm(rawQ);
  if (q.length < 2) return true;
  if (offer.titleSearch.includes(q)) return true;
  if (offer.companySearch.includes(q)) return true;
  if (offer.oemSearch.includes(q)) return true;
  if (offer.brandSearch.includes(q)) return true;
  if (offer.citySearch.includes(q)) return true;
  if (norm(offer.shortSnippet).includes(q)) return true;
  if (norm(offer.sourceName).includes(q)) return true;
  const sourceLabel = norm(CATALOG_SOURCE_NAME_LABEL[offer.sourceName] ?? "");
  if (sourceLabel.includes(q)) return true;
  if (offer.brand && norm(offer.brand).includes(q)) return true;
  for (const code of [...offer.oemCodes, ...offer.articleCodes]) {
    if (norm(code).includes(q)) return true;
  }
  return false;
}

export function filterSourceOffersInMemory(
  offers: CatalogSourceOffer[],
  opts: CatalogSourceOfferListQuery,
): CatalogSourceOffer[] {
  const limit = opts.limit ?? 48;
  let list = offers.filter((o) =>
    isValidPublishedSourceOffer(
      inputFromSourceOfferFields({
        title: o.title,
        price: o.price,
        city: o.city,
        region: o.region,
        categorySlug: o.categorySlug,
        companyName: o.companyName,
        sellerName: o.sellerName,
        brand: o.brand,
        oemCodes: o.oemCodes,
        articleCodes: o.articleCodes,
        sourceName: o.sourceName,
        sourceUrl: o.sourceUrl,
        shortSnippet: o.shortSnippet,
        confidenceScore: o.confidenceScore,
      }),
    ),
  );

  if (opts.categorySlug) {
    const cat = opts.categorySlug.trim().toLowerCase();
    list = list.filter((o) => o.categorySlug === cat);
  }
  if (opts.city) {
    const c = opts.city.trim().toLowerCase();
    list = list.filter((o) => o.citySearch.includes(c) || o.city.toLowerCase().includes(c));
  }
  if (opts.sourceName) {
    list = list.filter((o) => o.sourceName === opts.sourceName);
  }
  if (opts.q && opts.q.trim().length >= 2) {
    list = list.filter((o) => offerMatchesTextQuery(o, opts.q!));
  }
  if (opts.priceMin != null || opts.priceMax != null) {
    list = list.filter((o) => {
      const rub = parseOfferPriceRub(o.price);
      if (rub == null) return false;
      if (opts.priceMin != null && rub < opts.priceMin) return false;
      if (opts.priceMax != null && rub > opts.priceMax) return false;
      return true;
    });
  }

  return list.slice(0, limit);
}

export function parseSourceOfferListQuery(searchParams: URLSearchParams): CatalogSourceOfferListQuery {
  const q = searchParams.get("q") ?? undefined;
  const categorySlug = searchParams.get("category") ?? searchParams.get("categorySlug") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const sourceRaw = searchParams.get("sourceName") ?? searchParams.get("source") ?? undefined;
  const sourceName = parseCatalogSourceName(sourceRaw);
  const priceMin = Number(searchParams.get("priceMin") ?? searchParams.get("priceFrom"));
  const priceMax = Number(searchParams.get("priceMax") ?? searchParams.get("priceTo"));
  const limit = Number(searchParams.get("limit") ?? 48);

  return {
    q: q?.trim() || undefined,
    categorySlug: categorySlug?.trim().toLowerCase() || undefined,
    city: city?.trim() || undefined,
    sourceName,
    priceMin: Number.isFinite(priceMin) && priceMin > 0 ? priceMin : undefined,
    priceMax: Number.isFinite(priceMax) && priceMax > 0 ? priceMax : undefined,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 48,
  };
}
