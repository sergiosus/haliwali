import { parseOfferPriceRub } from "./catalogSourceOfferQuery";

/** Normalize SERP / form price to digits-only text for DB (`180000`). */
export function normalizeOfferPriceForStorage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n));
}

/** Display price as `180 000 ₽` when numeric digits are present. */
export function formatOfferPriceDisplay(price: string | null | undefined): string | null {
  const rub = parseOfferPriceRub(price);
  if (rub == null) return null;
  return `${rub.toLocaleString("ru-RU")} ₽`;
}

export function formatOfferImportedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}
