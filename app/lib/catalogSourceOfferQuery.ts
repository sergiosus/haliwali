import { CATALOG_SOURCE_NAME_LABEL } from "./catalogSourceName";
import { isValidPublishedSourceOffer, inputFromSourceOfferFields } from "./catalogSourceOfferValidation";
import { effectiveOfferType } from "./catalogSourceOfferType";
import {
  parseCatalogSourceName,
  parseCatalogSourceOfferType,
  type CatalogSourceName,
  type CatalogSourceOffer,
  type CatalogSourceOfferType,
} from "./catalogSourceOfferTypes";

export type CatalogSourceOfferPageSize = 20 | 50 | 100;

export type CatalogSourceOfferListQuery = {
  q?: string;
  city?: string;
  brand?: string;
  oemArticle?: string;
  sourceName?: CatalogSourceName;
  offerType?: CatalogSourceOfferType;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
};

export type CatalogSourceOfferListResult = {
  offers: CatalogSourceOffer[];
  total: number;
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
  if (norm(offer.shortSnippet).includes(q)) return true;
  if (offer.brandSearch.includes(q)) return true;
  if (offer.brand && norm(offer.brand).includes(q)) return true;
  if (offer.oemSearch.includes(q)) return true;
  for (const code of [...offer.oemCodes, ...offer.articleCodes]) {
    if (norm(code).includes(q)) return true;
  }
  if (offer.companySearch.includes(q)) return true;
  if (offer.citySearch.includes(q)) return true;
  if (norm(offer.sourceName).includes(q)) return true;
  const sourceLabel = norm(CATALOG_SOURCE_NAME_LABEL[offer.sourceName] ?? "");
  if (sourceLabel.includes(q)) return true;
  return false;
}

function matchesBrand(offer: CatalogSourceOffer, brand: string): boolean {
  const b = norm(brand);
  if (!b) return true;
  return offer.brandSearch.includes(b) || norm(offer.brand ?? "").includes(b);
}

function matchesOemArticle(offer: CatalogSourceOffer, oemArticle: string): boolean {
  const needle = norm(oemArticle);
  if (!needle) return true;
  if (offer.oemSearch.includes(needle)) return true;
  for (const code of [...offer.oemCodes, ...offer.articleCodes]) {
    if (norm(code).includes(needle)) return true;
  }
  return norm(offer.shortSnippet).includes(needle) || offer.titleSearch.includes(needle);
}

function filterValidPublished(offers: CatalogSourceOffer[]): CatalogSourceOffer[] {
  return offers.filter((o) =>
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
        offerType: o.offerType,
        coverImageUrl: o.coverImageUrl,
        confidenceScore: o.confidenceScore,
      }),
    ),
  );
}

export function filterSourceOffersInMemory(
  offers: CatalogSourceOffer[],
  opts: CatalogSourceOfferListQuery,
): CatalogSourceOfferListResult {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  let list = filterValidPublished(offers);

  if (opts.city) {
    const c = opts.city.trim().toLowerCase();
    list = list.filter((o) => o.citySearch.includes(c) || o.city.toLowerCase().includes(c));
  }
  if (opts.sourceName) {
    list = list.filter((o) => o.sourceName === opts.sourceName);
  }
  if (opts.offerType) {
    const want = opts.offerType;
    list = list.filter(
      (o) =>
        effectiveOfferType(o.offerType, {
          title: o.title,
          sourceUrl: o.sourceUrl,
          brand: o.brand,
          oemCodes: o.oemCodes,
          articleCodes: o.articleCodes,
        }) === want,
    );
  }
  if (opts.brand?.trim()) {
    list = list.filter((o) => matchesBrand(o, opts.brand!));
  }
  if (opts.oemArticle?.trim()) {
    list = list.filter((o) => matchesOemArticle(o, opts.oemArticle!));
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

  const total = list.length;
  return {
    offers: list.slice(offset, offset + limit),
    total,
  };
}

export function parseSourceOfferPageSize(raw: string | null): CatalogSourceOfferPageSize {
  const n = Number(raw);
  if (n === 50 || n === 100) return n;
  return 20;
}

export function parseSourceOfferListQuery(searchParams: URLSearchParams): CatalogSourceOfferListQuery {
  const q = searchParams.get("q") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const brand = searchParams.get("brand") ?? undefined;
  const oemArticle =
    searchParams.get("oem") ?? searchParams.get("oemArticle") ?? searchParams.get("article") ?? undefined;
  const sourceRaw = searchParams.get("sourceName") ?? searchParams.get("source") ?? undefined;
  const sourceName = parseCatalogSourceName(sourceRaw);
  const offerTypeRaw = searchParams.get("offerType") ?? undefined;
  const offerType =
    offerTypeRaw && offerTypeRaw !== "all" ?
      parseCatalogSourceOfferType(offerTypeRaw)
    : undefined;
  const priceMin = Number(searchParams.get("priceMin") ?? searchParams.get("priceFrom"));
  const priceMax = Number(searchParams.get("priceMax") ?? searchParams.get("priceTo"));
  const pageSize = parseSourceOfferPageSize(searchParams.get("pageSize"));
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const offset = (page - 1) * pageSize;

  return {
    q: q?.trim() || undefined,
    city: city?.trim() || undefined,
    brand: brand?.trim() || undefined,
    oemArticle: oemArticle?.trim() || undefined,
    sourceName,
    offerType,
    priceMin: Number.isFinite(priceMin) && priceMin > 0 ? priceMin : undefined,
    priceMax: Number.isFinite(priceMax) && priceMax > 0 ? priceMax : undefined,
    limit: pageSize,
    offset,
  };
}
