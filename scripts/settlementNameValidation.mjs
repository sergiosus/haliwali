/**
 * Must match `app/lib/settlementNameValidation.ts` rules (build pipeline only).
 */
const SHORT_CYRILLIC_ONLY = /^[А-Яа-яЁё]{1,2}$/u;
const BOGUS_SETTLEMENT_NAMES = new Set(["ижау"]);

/** @param {string} cleanedName */
export function isValidSettlementName(cleanedName) {
  const t = String(cleanedName ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t || t.length < 3) return false;
  if (BOGUS_SETTLEMENT_NAMES.has(t.toLowerCase())) return false;
  if (t === "Иж") return false;
  if (SHORT_CYRILLIC_ONLY.test(t)) return false;
  if (/[^\u0400-\u04FF\s\-]/u.test(t)) return false;
  if (/[()[\]{}«»]/.test(t)) return false;
  return true;
}
