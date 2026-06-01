import { parseOfferPriceRub } from "./catalogSourceOfferQuery";

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
