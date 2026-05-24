/**
 * Native Haliwali display layer for external marketplace cards (no extra scraping).
 */

import { latinTypingToRussianApprox } from "./globalSearchNormalize";
import type { ExternalMarketplaceCard } from "./externalMarketplaceProviders";
import { isFakeMarketplaceTitle } from "./marketplaceCardQuality";
import { providerNameRu } from "./marketplaceProviderLabels";

export type MarketplaceDisplayCard = ExternalMarketplaceCard & {
  sourceNameRu: string;
  titleDisplay: string;
  snippetDisplay: string | null;
  priceDisplay: string | null;
};

const GENERIC_SEARCH_TITLE =
  /^(search results|results for|купить|buy|shop|store|official site|wholesale)/i;

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isMostlyLatin(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z\u0400-\u04FF]/g, "");
  if (!letters.length) return false;
  const cyr = (letters.match(/[\u0400-\u04FF]/g) ?? []).length;
  return cyr / letters.length < 0.35;
}

/** Lightweight EN/CN title cleanup — no external translation API. */
export function lightweightMarketplaceTitlePreview(title: string): string {
  const raw = collapseSpaces(title);
  if (!raw || isFakeMarketplaceTitle(raw)) return raw.slice(0, 160);

  if (/[\u0400-\u04FF]/.test(raw) && !isMostlyLatin(raw)) {
    return raw.slice(0, 160);
  }

  let t = raw
    .replace(/^[\w.-]+\.(com|ru|net|org)\s*[-:–|]\s*/i, "")
    .replace(/\s*[-|]\s*(Amazon|eBay|AliExpress|Ozon|Wildberries).*$/i, "")
    .trim();

  if (GENERIC_SEARCH_TITLE.test(t) || t.length < 4 || isFakeMarketplaceTitle(t)) {
    return raw.slice(0, 160);
  }

  if (isMostlyLatin(t)) {
    const approx = latinTypingToRussianApprox(t);
    if (approx && approx.length >= 3 && /[\u0400-\u04FF]/.test(approx)) {
      return approx.slice(0, 160);
    }
  }

  return t.slice(0, 160);
}

function formatPriceDisplay(price: string | null): string | null {
  if (!price) return null;
  const p = collapseSpaces(price);
  if (!p) return null;
  if (/₽|руб|RUB/i.test(p)) return p;
  if (/^\d+([.,]\d+)?$/.test(p)) return `${p} ₽`;
  return p;
}

/** Enrich a verified real product card for in-app native UI. */
export function enrichMarketplaceCardForDisplay(
  card: ExternalMarketplaceCard,
  _normalizedQuery: string,
): MarketplaceDisplayCard {
  const sourceNameRu = providerNameRu(card.providerId, card.sourceName);
  const titleDisplay = lightweightMarketplaceTitlePreview(card.title);

  const rawSnippet = (card.snippet ?? "").trim();
  const snippetDisplay =
    rawSnippet && !GENERIC_SEARCH_TITLE.test(rawSnippet) && !isFakeMarketplaceTitle(rawSnippet) ?
      rawSnippet.slice(0, 180)
    : null;

  return {
    ...card,
    sourceName: card.sourceName,
    sourceNameRu,
    titleDisplay,
    snippetDisplay,
    priceDisplay: formatPriceDisplay(card.price),
  };
}

export function enrichMarketplaceCardsForDisplay(
  cards: ExternalMarketplaceCard[],
  normalizedQuery: string,
): MarketplaceDisplayCard[] {
  return cards.map((c) => enrichMarketplaceCardForDisplay(c, normalizedQuery));
}
