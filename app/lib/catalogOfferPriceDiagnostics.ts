/**
 * Verified RUB price display — never show legacy digits without ₽ context.
 */

import type { OfferPriceFields } from "./catalogOfferPrice";
import { formatOfferPriceDisplay } from "./catalogSourceOfferFormat";

export type OfferPriceSource = "json-ld" | "og" | "app-state" | "html" | "fallback" | "none";

export function priceSourceFromRubFields(
  fields: Pick<OfferPriceFields, "priceAmount">,
  whenFound: OfferPriceSource = "html",
): OfferPriceSource {
  return fields.priceAmount != null && fields.priceAmount > 0 ? whenFound : "none";
}

function readPriceSource(raw: Record<string, unknown> | null | undefined): OfferPriceSource {
  const v = raw?.priceSource;
  if (
    v === "json-ld" ||
    v === "og" ||
    v === "app-state" ||
    v === "html" ||
    v === "fallback" ||
    v === "none"
  ) {
    return v;
  }
  return "none";
}

/** True only when we have RUB-marked price from extraction (not bare mileage digits). */
export function hasVerifiedSourceOfferPrice(offer: {
  priceText?: string | null;
  priceAmount?: number | null;
  rawPayload?: Record<string, unknown> | null;
}): boolean {
  const text = (offer.priceText ?? "").trim();
  if (text && /(?:₽|руб\.?|р\.)/i.test(text)) return true;
  const amount = offer.priceAmount;
  if (amount == null || !(amount > 0)) return false;
  const src = readPriceSource(offer.rawPayload);
  return src !== "none";
}

export function sourceOfferPriceDiagnostics(offer: {
  priceText?: string | null;
  priceAmount?: number | null;
  rawPayload?: Record<string, unknown> | null;
}): { found: boolean; source: OfferPriceSource } {
  if (!hasVerifiedSourceOfferPrice(offer)) {
    return { found: false, source: "none" };
  }
  const src = readPriceSource(offer.rawPayload);
  return { found: true, source: src };
}

export function priceDiagnosticsLabel(offer: {
  priceText?: string | null;
  priceAmount?: number | null;
  rawPayload?: Record<string, unknown> | null;
}): string {
  const d = sourceOfferPriceDiagnostics(offer);
  return `price: ${d.found ? "found" : "not found"} · priceSource: ${d.source}`;
}

/** Public/admin display — null means show «Цена не указана». */
export function displayVerifiedSourceOfferPrice(offer: {
  priceText?: string | null;
  priceAmount?: number | null;
  price?: string | null;
  rawPayload?: Record<string, unknown> | null;
}): string | null {
  if (!hasVerifiedSourceOfferPrice(offer)) return null;
  const text = offer.priceText?.trim();
  if (text) return text;
  if (offer.priceAmount != null && offer.priceAmount > 0) {
    return `${offer.priceAmount.toLocaleString("ru-RU")} ₽`;
  }
  return formatOfferPriceDisplay(offer.price);
}
