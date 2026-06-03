export type TitleSource = "card" | "listing" | "metadata" | "url";

const BRAND_CASE: Record<string, string> = {
  volkswagen: "Volkswagen",
  bmw: "BMW",
  toyota: "Toyota",
  mercedes: "Mercedes",
  audi: "Audi",
  skoda: "Skoda",
  ford: "Ford",
  kia: "Kia",
  hyundai: "Hyundai",
  renault: "Renault",
  nissan: "Nissan",
};

function titleCaseToken(w: string): string {
  if (!w) return w;
  const lower = w.toLowerCase();
  if (BRAND_CASE[lower]) return BRAND_CASE[lower]!;
  // Preserve short all-caps tokens.
  if (/^[A-Z]{2,6}$/.test(w)) return w;
  // Preserve OEM-ish tokens.
  if (/^[a-z0-9]{2,10}$/i.test(w) && /\d/.test(w)) return w.toUpperCase();
  return w[0]!.toUpperCase() + w.slice(1);
}

function normalizeSlugFormatting(raw: string): string {
  return raw
    .trim()
    .replace(/[_/]+/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugQualityPoor(t: string): boolean {
  if (!t) return true;
  // If it has no letters at all, it’s useless.
  if (!/[A-Za-zА-Яа-яЁё]/.test(t)) return true;
  // Extremely long slugs are usually garbage.
  if (t.length > 140) return true;
  return false;
}

/**
 * URL slug formatting only.
 * Rules:
 * - replace "-" and "_" with spaces
 * - collapse spaces
 * - capitalize tokens
 * - preserve known brand casing
 * Never translate individual words.
 */
export function formatUrlSlugTitle(raw: string): string {
  const normalized = normalizeSlugFormatting(raw);
  if (slugQualityPoor(normalized)) return "";
  const tokens = normalized.split(" ").filter(Boolean);
  const capped = tokens.map(titleCaseToken).join(" ").trim();
  if (slugQualityPoor(capped)) return "";
  return capped;
}


