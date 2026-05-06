/** Minimal helpers for federal districts / region matching (location scope). */

import { FEDERAL_DISTRICTS, subjectsForFederalDistrict } from "./russiaFederalDistricts";

export const FEDERAL_DISTRICT_MARKERS = FEDERAL_DISTRICTS;

export function isFederalDistrictLabel(name: string): boolean {
  const t = (name ?? "").trim();
  if (!t) return false;
  return (
    (FEDERAL_DISTRICT_MARKERS as readonly string[]).some((d) => d === t) ||
    t.toLowerCase().includes("федеральный округ")
  );
}

/** Canonical subjects for a federal district (lowercased). */
export function federalDistrictSubjectsLc(label: string): string[] {
  return subjectsForFederalDistrict(label).map((s) => s.toLowerCase());
}

export function normalizeComparableRegionKey(s: string): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function regionLabelsMatch(a: string, b: string): boolean {
  const x = normalizeComparableRegionKey(a);
  const y = normalizeComparableRegionKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
