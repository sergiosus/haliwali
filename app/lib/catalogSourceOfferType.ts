/**
 * Soft offer types for lightweight external offer index (not full listings).
 */

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

export function resolveOfferSearchSources(opts: {
  offerType: CatalogSourceOfferType;
  sourceFilter: "all" | OfferListingSourceId | "company_site" | "other";
}): ResolvedOfferSearchSources {
  const { offerType, sourceFilter } = opts;

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
        primary: ["avito", "auto_ru"],
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
  if (source === "youla") return "Youla blocked by captcha (источник отключён).";
  if (source === "vk") return "VK parser not implemented yet";
  return null;
}
