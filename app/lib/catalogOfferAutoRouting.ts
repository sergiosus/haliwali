const AUTOMOTIVE_QUERY_RE =
  /\b(?:car|auto|авто|машин|vin|touran|camry|bmw|toyota|vw|volkswagen|mercedes|audi|kia|hyundai|nissan|honda|ford|chevrolet|lada|ваз|газ|уаз|octavia|polo|golf|tiguan|passat|solaris|rio|creta)\b/i;

const AUTOMOTIVE_CATEGORY_SLUGS = new Set(["auto", "cars", "avto", "авто"]);

export function isAutomotiveCategorySlug(categorySlug: string | undefined | null): boolean {
  const s = (categorySlug ?? "").trim().toLowerCase();
  return AUTOMOTIVE_CATEGORY_SLUGS.has(s);
}

export function isAutomotiveSearchQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return AUTOMOTIVE_QUERY_RE.test(q);
}

export function isAutomotiveOfferSearch(
  query: string,
  categorySlug?: string | null,
): boolean {
  return isAutomotiveCategorySlug(categorySlug) || isAutomotiveSearchQuery(query);
}

export {
  resolveOfferSearchSources,
  shouldRunDromFallback,
  disabledSourcesForResolved,
  type ResolvedOfferSearchSources,
} from "./catalogSourceOfferType";
