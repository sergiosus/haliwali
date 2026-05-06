import { calculateDistanceKm } from "@/lib/shared/geo";

/** Ижевск (city center, WGS-84) — halo used only to drop junk rows that clip the capital. */
export const IZHEVSK_REFERENCE = { lat: 56.85264, lng: 53.20616 };

const NEAR_IZHEVSK_HALO_KM = 0.5;
const BOGUS_SETTLEMENT_NAMES = new Set(["ижау"]);

/** Cyrillic-only token of 1–2 letters (GeoNames truncation junk like «Иж», «Ик»). */
const SHORT_CYRILLIC_ONLY = /^[А-Яа-яЁё]{1,2}$/u;

/**
 * Keep in sync with `scripts/settlementNameValidation.mjs` (build pipeline).
 * Rejects: length &lt; 3, exact «Иж», 1–2 letter Cyrillic-only names, disallowed symbols.
 */
export function isValidSettlementName(name: string): boolean {
  const cleanedName = name.trim().replace(/\s+/g, " ");
  if (!cleanedName || cleanedName.length < 3) return false;
  if (BOGUS_SETTLEMENT_NAMES.has(cleanedName.toLowerCase())) return false;
  if (cleanedName === "Иж") return false;
  if (SHORT_CYRILLIC_ONLY.test(cleanedName)) return false;
  if (/[^\u0400-\u04FF\s\-]/u.test(cleanedName)) return false;
  if (/[()[\]{}«»]/.test(cleanedName)) return false;
  return true;
}

/**
 * Near Ижевск, drop junk that would compete with the city (e.g. truncated «Иж»).
 * Does not remove real names like «Ижевское» at distinct coordinates or valid ≥3-char names.
 */
export function shouldSuppressNearIzhevskReference(name: string, lat: number, lng: number): boolean {
  const d = calculateDistanceKm(lat, lng, IZHEVSK_REFERENCE.lat, IZHEVSK_REFERENCE.lng);
  if (d > NEAR_IZHEVSK_HALO_KM + 1e-9) return false;
  const t = name.trim();
  if (t === "Ижевск") return false;
  if (!isValidSettlementName(t)) return true;
  return false;
}
