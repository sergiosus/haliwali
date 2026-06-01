/**
 * Automotive offer search relevance scoring (Avito + Auto.ru).
 */

import { sanitizeOfferText } from "./catalogOfferSearchText";

export type AutoOfferScoreInput = {
  title: string;
  shortSnippet: string;
  url: string;
  city: string;
  brand: string | null;
  year?: number | null;
};

export const AUTO_RELEVANCE_MIN_SCORE = 60;

const QUERY_ALIASES: Record<string, string[]> = {
  touran: ["touran", "туран", "vw touran", "volkswagen touran"],
  туран: ["touran", "туран", "vw touran", "volkswagen touran"],
  vw: ["vw", "volkswagen", "фольксваген"],
  volkswagen: ["vw", "volkswagen", "фольксваген", "фолькс"],
  camry: ["camry", "камри", "toyota camry"],
  bmw: ["bmw", "бмв"],
  toyota: ["toyota", "тойота"],
};

const BRAND_TOKENS = new Set([
  "vw",
  "volkswagen",
  "фольксваген",
  "toyota",
  "тойота",
  "bmw",
  "бмв",
  "mercedes",
  "мерседес",
  "audi",
  "ауди",
  "kia",
  "киа",
  "hyundai",
  "хендай",
  "nissan",
  "ниссан",
  "ford",
  "форд",
  "chevrolet",
  "шевроле",
  "lada",
  "лада",
]);

function norm(s: string): string {
  return sanitizeOfferText(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_\-./]+/g, " ");
}

export function normalizeAutomotiveQuery(query: string): string[] {
  const raw = query
    .trim()
    .toLowerCase()
    .split(/[\s,;+/]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2);

  const variants = new Set<string>();
  for (const t of raw) {
    variants.add(t);
    const aliases = QUERY_ALIASES[t];
    if (aliases) aliases.forEach((a) => variants.add(norm(a)));
  }

  const joined = norm(query);
  if (joined.includes("vw touran") || joined.includes("volkswagen touran")) {
    ["touran", "туран", "vw", "volkswagen"].forEach((v) => variants.add(v));
  }
  if (joined === "touran" || joined === "туран") {
    ["touran", "туран"].forEach((v) => variants.add(v));
  }

  return [...variants].filter((t) => t.length >= 2);
}

function modelTokens(variants: string[]): string[] {
  return variants.filter((t) => !BRAND_TOKENS.has(t) && t.length >= 3);
}

function brandTokens(variants: string[]): string[] {
  return variants.filter((t) => BRAND_TOKENS.has(t));
}

export function scoreAutomotiveOffer(
  query: string,
  item: AutoOfferScoreInput,
  cityNeedle?: string,
): number {
  const variants = normalizeAutomotiveQuery(query);
  if (variants.length === 0) return 100;

  const title = norm(item.title);
  const blob = norm(`${item.title} ${item.shortSnippet} ${item.url} ${item.brand ?? ""}`);
  const models = modelTokens(variants);
  const brands = brandTokens(variants);

  let score = 0;

  const exactTitle = variants.some((v) => title.includes(v));
  if (exactTitle) score += 100;

  if (brands.some((b) => blob.includes(b))) score += 50;
  if (models.some((m) => blob.includes(m))) score += 50;

  const city = (cityNeedle ?? "").trim();
  if (city.length >= 2) {
    const cityNorm = norm(city);
    if (norm(item.city).includes(cityNorm) || blob.includes(cityNorm)) score += 20;
  }

  return score;
}

export function passesAutomotiveRelevance(
  query: string,
  item: AutoOfferScoreInput,
  cityNeedle?: string,
): boolean {
  return scoreAutomotiveOffer(query, item, cityNeedle) >= AUTO_RELEVANCE_MIN_SCORE;
}
