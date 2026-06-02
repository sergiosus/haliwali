/**
 * Price extraction and display for source offers (RUB listings only).
 */

import { formatOfferPriceDisplay, normalizeOfferPriceForStorage } from "./catalogSourceOfferFormat";

export type OfferPriceFields = {
  priceAmount: number | null;
  priceText: string | null;
  /** Legacy `price` column — digits string for search/filters. */
  price: string | null;
};

const RUB_PRICE_RE = /([0-9][0-9\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)(?!\w)/gi;
const KM_NEAR_RE = /\d[\d\s\u00a0]{2,12}\s*(?:км|km)\b/i;

function formatRubText(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

/** Parse listing price from SERP card HTML/JSON context — ignores mileage without ₽. */
export function parseListingPriceFromContext(ctx: string): OfferPriceFields {
  const empty: OfferPriceFields = { priceAmount: null, priceText: null, price: null };
  if (!ctx?.trim()) return empty;

  const candidates: { amount: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  RUB_PRICE_RE.lastIndex = 0;
  while ((m = RUB_PRICE_RE.exec(ctx)) !== null) {
    const digits = m[1]!.replace(/\D/g, "");
    const amount = Number(digits);
    if (!Number.isFinite(amount) || amount < 100 || amount > 500_000_000) continue;
    const window = ctx.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
    if (KM_NEAR_RE.test(window) && !/(?:₽|руб|р\.)/i.test(m[0])) continue;
    candidates.push({ amount, index: m.index });
  }

  if (candidates.length === 0) return empty;

  candidates.sort((a, b) => a.index - b.index);
  return offerPriceFromAmount(candidates[0]!.amount);
}

export function offerPriceFromAmount(amount: number | null | undefined): OfferPriceFields {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return { priceAmount: null, priceText: null, price: null };
  }
  const n = Math.round(amount);
  return {
    priceAmount: n,
    priceText: formatRubText(n),
    price: String(n),
  };
}

export function offerPriceFromLegacyPrice(raw: string | null | undefined): OfferPriceFields {
  const stored = normalizeOfferPriceForStorage(raw);
  if (!stored) return { priceAmount: null, priceText: null, price: null };
  const amount = Number(stored);
  return offerPriceFromAmount(amount);
}

export function mergeOfferPriceFields(
  primary: OfferPriceFields,
  fallback?: Partial<OfferPriceFields> | null,
): OfferPriceFields {
  const amount = primary.priceAmount ?? fallback?.priceAmount ?? null;
  const text = primary.priceText?.trim() || fallback?.priceText?.trim() || null;
  if (amount != null && amount > 0) {
    return {
      priceAmount: amount,
      priceText: text ?? formatRubText(amount),
      price: String(amount),
    };
  }
  if (text) {
    const fromText = offerPriceFromLegacyPrice(text.replace(/[^\d]/g, ""));
    return fromText.priceAmount ? fromText : { priceAmount: null, priceText: text, price: null };
  }
  return offerPriceFromLegacyPrice(primary.price ?? fallback?.price ?? null);
}

/** Public card display — verified RUB only (see catalogOfferPriceDiagnostics). */
export { displayVerifiedSourceOfferPrice as displaySourceOfferPrice } from "./catalogOfferPriceDiagnostics";
