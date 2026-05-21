import type { Listing } from "./listingModel";
import { getListingAttributeFieldDefs } from "./listingAttributeResolver";
import type { ListingAttributeFieldDef, ListingAttributes } from "./listingAttributeSchemas";

export type { ListingAttributes, ListingAttributeFieldDef } from "./listingAttributeSchemas";
export type { ListingAttributeSchemaId } from "./listingAttributeSchemas";
export {
  getListingAttributeFieldDefs,
  resolveListingAttributeSchemaId,
  normalizeListingCategoryKey,
  CATEGORY_SLUG_TO_SCHEMA_ID,
  PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID,
  categorySlugsWithAttributeSchemas,
  productCategoryNamesWithSchemas,
  serviceCategoryNamesWithSchemas,
  taskCategoryNamesWithSchemas,
} from "./listingAttributeResolver";
export { GENERIC_SERVICE_FIELDS, LISTING_SERVICE_SCHEMAS } from "./listingServiceAttributeSchemas";
export { GENERIC_TASK_FIELDS, LISTING_TASK_SCHEMAS } from "./listingTaskAttributeSchemas";
export { LISTING_ATTRIBUTE_SCHEMAS, LISTING_ATTRIBUTE_SCHEMA_IDS } from "./listingAttributeSchemas";

function isEmptyAttributeValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "boolean") return false;
  if (typeof v === "number") return !Number.isFinite(v);
  return String(v).trim() === "";
}

export function parseListingAttributesJson(raw: unknown): ListingAttributes | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ListingAttributes = {};
  for (const [k, v] of Object.entries(o)) {
    if (!k.trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeListingAttributes(
  raw: unknown,
  fieldDefs: readonly ListingAttributeFieldDef[],
): ListingAttributes | undefined {
  if (!fieldDefs.length) return undefined;
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const allowed = new Map(fieldDefs.map((f) => [f.key, f]));
  const out: ListingAttributes = {};

  for (const [key, def] of allowed) {
    const rawVal = source[key];
    if (isEmptyAttributeValue(rawVal)) continue;

    if (def.type === "boolean") {
      if (rawVal === true || rawVal === "true" || rawVal === 1 || rawVal === "1") out[key] = true;
      else if (rawVal === false || rawVal === "false" || rawVal === 0 || rawVal === "0") out[key] = false;
      continue;
    }

    if (def.type === "number") {
      const n = typeof rawVal === "number" ? rawVal : Number(rawVal);
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }

    if (def.type === "select" && def.options?.length) {
      const s = String(rawVal).trim();
      if (def.options.includes(s)) out[key] = s;
      continue;
    }

    const s = String(rawVal).trim();
    if (s) out[key] = s.slice(0, 200);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeListingAttributesForListing(listing: Pick<Listing, "categoryName" | "categorySlug" | "type">, raw: unknown): ListingAttributes | undefined {
  const defs = getListingAttributeFieldDefs(listing.categoryName, listing.categorySlug, listing.type);
  return sanitizeListingAttributes(raw, defs);
}

export function listingHasFilledAttributes(listing: Pick<Listing, "attributes">): boolean {
  const a = listing.attributes;
  if (!a || typeof a !== "object") return false;
  return Object.values(a).some((v) => !isEmptyAttributeValue(v));
}

export function formatListingAttributeValue(def: ListingAttributeFieldDef, value: string | number | boolean): string {
  if (def.type === "boolean") return value ? "Да" : "Нет";
  const base = String(value);
  return def.unit ? `${base} ${def.unit}` : base;
}

export type ListingAttributeDisplayLine = { label: string; value: string };

export function listingAttributeDisplayLines(
  listing: Pick<Listing, "attributes" | "categoryName" | "categorySlug" | "type">,
): ListingAttributeDisplayLine[] {
  if (!listingHasFilledAttributes(listing)) return [];
  const defs = getListingAttributeFieldDefs(listing.categoryName, listing.categorySlug, listing.type);
  const attrs = listing.attributes ?? {};
  const lines: ListingAttributeDisplayLine[] = [];
  for (const def of defs) {
    const v = attrs[def.key];
    if (isEmptyAttributeValue(v)) continue;
    lines.push({
      label: def.label,
      value: formatListingAttributeValue(def, v as string | number | boolean),
    });
  }
  return lines;
}

/** Compact single line for cards (max ~4 segments). */
export function listingAttributesCompactText(
  listing: Pick<Listing, "attributes" | "categoryName" | "categorySlug" | "type">,
  maxParts = 4,
): string {
  const parts = listingAttributeDisplayLines(listing)
    .slice(0, maxParts)
    .map((l) => `${l.label}: ${l.value}`);
  return parts.join(" · ");
}

export function listingAttributesSearchText(
  listing: Pick<Listing, "attributes" | "categoryName" | "categorySlug" | "type">,
): string {
  if (!listingHasFilledAttributes(listing)) return "";
  const defs = getListingAttributeFieldDefs(listing.categoryName, listing.categorySlug, listing.type);
  const attrs = listing.attributes ?? {};
  const chunks: string[] = [];
  for (const def of defs) {
    const v = attrs[def.key];
    if (isEmptyAttributeValue(v)) continue;
    chunks.push(def.label, def.key, formatListingAttributeValue(def, v as string | number | boolean));
  }
  return chunks.join(" ");
}
