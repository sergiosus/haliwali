/**
 * Soft offer types for lightweight external offer index (not full listings).
 */

import { catalogSourceDiagnosticMessage } from "./catalogSourceRegistry";
import type { OfferListingSourceId } from "./catalogSourceOfferTypes";
import { isAutomotiveSearchQuery } from "./catalogOfferAutoRouting";

export const CATALOG_SOURCE_OFFER_TYPES = [
  "auto",
  "parts",
  "electronics",
  "real_estate",
  "other",
] as const;

export type CatalogSourceOfferType = (typeof CATALOG_SOURCE_OFFER_TYPES)[number];

export const OFFER_TYPE_LABELS: Record<CatalogSourceOfferType, string> = {
  auto: "Авто",
  parts: "Запчасти",
  electronics: "Техника",
  real_estate: "Недвижимость",
  other: "Прочее",
};

export type OfferTypeFilter = "all" | CatalogSourceOfferType;

export function parseCatalogSourceOfferType(raw: string | null | undefined): CatalogSourceOfferType {
  const s = (raw ?? "").trim().toLowerCase();
  if ((CATALOG_SOURCE_OFFER_TYPES as readonly string[]).includes(s)) {
    return s as CatalogSourceOfferType;
  }
  return "other";
}

const PARTS_QUERY_RE =
  /\b(?:запчаст|oem|артикул|арт\.|детал|насос|фильтр|колодк|амортиз|стартер|генератор|caterpillar|komatsu|hyundai\s*\d)\b/i;

const ELECTRONICS_QUERY_RE =
  /\b(?:iphone|samsung|xiaomi|ноутбук|laptop|macbook|playstation|xbox|телефон|планшет|наушник|телевизор|электроник)\b/i;

const REAL_ESTATE_QUERY_RE =
  /\b(?:квартир|дом|участок|недвижим|аренд|сдам|продам\s+кв|комнат|м²|кв\.?\s*м)\b/i;

const AUTO_URL_RE =
  /(?:auto\.drom\.ru|\/\/auto\.ru\/|\/avtomobili\/|avito\.ru\/[^?]*avtomobil|\/cars\/|\/avto\/)/i;

const PARTS_URL_RE =
  /(?:baza\.drom\.ru|\/zapchast|zapchasti|\/parts\/|\/oem\/|catalog\.drom\.ru)/i;

const AUTO_TITLE_RE =
  /\b(?:volkswagen|toyota|bmw|mercedes|audi|kia|hyundai|nissan|honda|ford|chevrolet|lada|ваз|уаз|octavia|polo|golf|tiguan|passat|touran|camry|solaris|rio|creta|skoda|renault|peugeot|citroen|mazda|subaru|lexus|infiniti|volvo|land\s*rover|jeep|chery|haval|geely|changan|omoda|jetour)\b/i;

export type OfferListingFields = {
  title?: string;
  sourceUrl?: string;
  oemArticle?: string | null;
  brand?: string | null;
  oemCodes?: string[];
  articleCodes?: string[];
};

/** Classify a stored listing from URL/title (import, publish, public filter). */
export function inferOfferTypeFromListing(fields: OfferListingFields): CatalogSourceOfferType {
  const url = (fields.sourceUrl ?? "").trim();
  const title = (fields.title ?? "").trim();
  const hay = `${title} ${fields.brand ?? ""}`.trim();
  const oem =
    (fields.oemArticle ?? "").trim() ||
    [...(fields.oemCodes ?? []), ...(fields.articleCodes ?? [])].join(" ");

  if (url && AUTO_URL_RE.test(url)) return "auto";
  if (url && PARTS_URL_RE.test(url)) return "parts";
  if (oem.length >= 3) return "parts";
  if (AUTO_TITLE_RE.test(hay) || isAutomotiveSearchQuery(hay)) return "auto";
  if (PARTS_QUERY_RE.test(hay) || PARTS_QUERY_RE.test(oem)) return "parts";
  if (ELECTRONICS_QUERY_RE.test(hay)) return "electronics";
  if (REAL_ESTATE_QUERY_RE.test(hay)) return "real_estate";

  return "other";
}

/** Stored type when set; otherwise infer from listing fields (legacy rows). */
export function effectiveOfferType(
  stored: string | null | undefined,
  fields: OfferListingFields,
): CatalogSourceOfferType {
  const parsed = parseCatalogSourceOfferType(stored);
  if (parsed !== "other") return parsed;
  return inferOfferTypeFromListing(fields);
}

export function resolveOfferTypeForStorage(
  input: OfferListingFields & { offerType?: string | null },
): CatalogSourceOfferType {
  const stored = parseCatalogSourceOfferType(input.offerType);
  if (stored !== "other") return stored;
  const inferred = inferOfferTypeFromListing(input);
  return inferred;
}

const AUTO_TITLE_NEEDLE_SQL = `(
  title_search LIKE '%volkswagen%' OR title_search LIKE '%toyota%' OR title_search LIKE '%bmw%'
  OR title_search LIKE '%mercedes%' OR title_search LIKE '%touran%' OR title_search LIKE '%camry%'
  OR title_search LIKE '%polo%' OR title_search LIKE '%golf%' OR title_search LIKE '%octavia%'
  OR title_search LIKE '%solaris%' OR title_search LIKE '%lada%' OR title_search LIKE '%hyundai%'
  OR title_search LIKE '%kia%' OR title_search LIKE '%nissan%' OR title_search LIKE '%honda%'
  OR title_search LIKE '%ford%' OR title_search LIKE '%audi%' OR title_search LIKE '%skoda%'
  OR title_search LIKE '%renault%' OR title_search LIKE '%ваз%' OR title_search LIKE '%уаз%'
)`;

const AUTO_HEURISTIC_SQL = `(
  lower(source_url) LIKE '%auto.drom.ru%'
  OR lower(source_url) LIKE '%//auto.ru/%'
  OR lower(source_url) LIKE '%avito.ru%avtomobil%'
  OR lower(source_url) LIKE '%/avtomobili/%'
  OR ${AUTO_TITLE_NEEDLE_SQL}
)`;

const PARTS_HEURISTIC_SQL = `(
  lower(source_url) LIKE '%baza.drom.ru%'
  OR lower(source_url) LIKE '%zapchast%'
  OR COALESCE(oem_search, '') <> ''
)`;

const ELECTRONICS_HEURISTIC_SQL = `(
  title_search LIKE '%iphone%' OR title_search LIKE '%samsung%' OR title_search LIKE '%xiaomi%'
  OR title_search LIKE '%ноутбук%' OR title_search LIKE '%macbook%' OR title_search LIKE '%playstation%'
  OR title_search LIKE '%телефон%' OR title_search LIKE '%планшет%'
)`;

const REAL_ESTATE_HEURISTIC_SQL = `(
  title_search LIKE '%квартир%' OR title_search LIKE '%недвижим%' OR title_search LIKE '%участок%'
  OR title_search LIKE '%аренд%' OR title_search LIKE '%комнат%'
)`;

function storedIsOtherSql(): string {
  return `COALESCE(NULLIF(TRIM(offer_type), ''), 'other') = 'other'`;
}

/** SQL fragment for filtering published offers by effective offer_type. */
export function sqlEffectiveOfferTypeMatch(offerType: CatalogSourceOfferType): string {
  switch (offerType) {
    case "auto":
      return `(offer_type = 'auto' OR (${storedIsOtherSql()} AND ${AUTO_HEURISTIC_SQL}))`;
    case "parts":
      return `(offer_type = 'parts' OR (${storedIsOtherSql()} AND ${PARTS_HEURISTIC_SQL}))`;
    case "electronics":
      return `(offer_type = 'electronics' OR (${storedIsOtherSql()} AND ${ELECTRONICS_HEURISTIC_SQL}))`;
    case "real_estate":
      return `(offer_type = 'real_estate' OR (${storedIsOtherSql()} AND ${REAL_ESTATE_HEURISTIC_SQL}))`;
    case "other":
      return `(
        (offer_type = 'other' OR offer_type IS NULL OR TRIM(offer_type) = '')
        AND NOT ${AUTO_HEURISTIC_SQL}
        AND NOT ${PARTS_HEURISTIC_SQL}
        AND NOT ${ELECTRONICS_HEURISTIC_SQL}
        AND NOT ${REAL_ESTATE_HEURISTIC_SQL}
      )`;
    default:
      return "TRUE";
  }
}

export function inferOfferType(opts: {
  query?: string;
  categorySlug?: string | null;
  oemArticle?: string | null;
}): CatalogSourceOfferType {
  const q = (opts.query ?? "").trim();
  const cat = (opts.categorySlug ?? "").trim().toLowerCase();
  const oem = (opts.oemArticle ?? "").trim();

  if (cat === "auto" || cat === "cars" || cat === "avto") return "auto";
  if (cat === "zapchasti" || cat === "parts") return "parts";
  if (oem.length >= 3) return "parts";

  if (isAutomotiveSearchQuery(q)) return "auto";
  if (PARTS_QUERY_RE.test(q)) return "parts";
  if (ELECTRONICS_QUERY_RE.test(q)) return "electronics";
  if (REAL_ESTATE_QUERY_RE.test(q)) return "real_estate";

  return "other";
}

export type ResolvedOfferSearchSources = {
  offerType: CatalogSourceOfferType;
  primary: OfferListingSourceId[];
  fallback: OfferListingSourceId[];
};

const DROM_FALLBACK_MIN = 5;

export function resolveOfferTypeForSearch(opts: {
  offerTypeFilter?: OfferTypeFilter;
  query?: string;
  categorySlug?: string | null;
  oemArticle?: string | null;
}): CatalogSourceOfferType {
  if (opts.offerTypeFilter && opts.offerTypeFilter !== "all") {
    return parseCatalogSourceOfferType(opts.offerTypeFilter);
  }
  return inferOfferType({
    query: opts.query,
    categorySlug: opts.categorySlug,
    oemArticle: opts.oemArticle,
  });
}

export function resolveOfferSearchSources(opts: {
  offerType?: CatalogSourceOfferType;
  sourceFilter: "all" | OfferListingSourceId | "company_site" | "other";
  query?: string;
  categorySlug?: string | null;
  oemArticle?: string | null;
  offerTypeFilter?: OfferTypeFilter;
}): ResolvedOfferSearchSources {
  const offerType =
    opts.offerType ??
    resolveOfferTypeForSearch({
      offerTypeFilter: opts.offerTypeFilter,
      query: opts.query,
      categorySlug: opts.categorySlug,
      oemArticle: opts.oemArticle,
    });
  const sourceFilter = opts.sourceFilter;

  if (sourceFilter === "avito") {
    return { offerType, primary: ["avito"], fallback: [] };
  }
  if (sourceFilter === "auto_ru") {
    return { offerType: "auto", primary: ["auto_ru"], fallback: [] };
  }
  if (sourceFilter === "drom") {
    return { offerType, primary: ["drom"], fallback: [] };
  }
  if (sourceFilter === "youla" || sourceFilter === "vk") {
    return { offerType, primary: [sourceFilter], fallback: [] };
  }
  if (sourceFilter === "company_site") {
    return { offerType, primary: [], fallback: [] };
  }

  switch (offerType) {
    case "auto":
      return {
        offerType,
        primary: ["avito"],
        fallback: ["drom"],
      };
    case "parts":
      return {
        offerType,
        primary: ["avito", "drom"],
        fallback: [],
      };
    case "electronics":
      return {
        offerType,
        primary: ["avito"],
        fallback: [],
      };
    case "real_estate":
      return {
        offerType,
        primary: ["avito"],
        fallback: [],
      };
    case "other":
    default:
      return {
        offerType: "other",
        primary: ["avito"],
        fallback: [],
      };
  }
}

export function shouldRunDromFallback(
  resolved: ResolvedOfferSearchSources,
  resultCount: number,
): boolean {
  return resolved.offerType === "auto" && resolved.fallback.includes("drom") && resultCount < DROM_FALLBACK_MIN;
}

export function disabledSourcesForResolved(
  resolved: ResolvedOfferSearchSources,
  activeSources: OfferListingSourceId[],
): OfferListingSourceId[] {
  const all: OfferListingSourceId[] = ["avito", "auto_ru", "drom", "youla", "vk"];
  const alwaysOff = new Set<OfferListingSourceId>(["youla", "vk"]);

  if (resolved.offerType === "auto") {
    if (!activeSources.includes("drom")) alwaysOff.add("drom");
  } else {
    alwaysOff.add("auto_ru");
    if (resolved.offerType !== "parts") alwaysOff.add("drom");
  }

  return all.filter((s) => !activeSources.includes(s) && alwaysOff.has(s));
}

export function disabledSourceMessage(source: OfferListingSourceId): string | null {
  const msg = catalogSourceDiagnosticMessage(source, { linksExtracted: 0, zeroReason: "disabled" });
  return msg || null;
}
