/**
 * Optional lightweight public-page metadata read (no storage, short timeout).
 * Falls back to link-only cards on any failure — never throws to callers.
 */

import type { ExternalMarketplaceCard, MarketplaceProvider } from "./externalMarketplaceProviders";
import {
  canFetchMarketplacePreviews,
  canHtmlExtractMarketplaceProducts,
  isNeverParseProvider,
} from "./externalMarketplaceProviders";
import { tryEbayApiPreview } from "./ebayMarketplacePreview";
import { extractProductCardsFromSearchHtml } from "./externalMarketplaceProductExtract";

const FETCH_TIMEOUT_MS = 4500;
const MIN_INTERVAL_BETWEEN_FETCH_MS = 400;
let lastProviderFetchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttleProviderFetch(): Promise<void> {
  const now = Date.now();
  const wait = lastProviderFetchAt + MIN_INTERVAL_BETWEEN_FETCH_MS - now;
  if (wait > 0) await sleep(wait);
  lastProviderFetchAt = Date.now();
}

/**
 * Best-effort single request to a public search/catalog URL.
 * No retries, no anti-bot evasion, standard fetch only.
 */
/** Live preview fetch — AliExpress HTML; eBay API when configured (no HTML scrape). */
export async function tryMarketplaceProviderPreview(
  provider: MarketplaceProvider,
  normalizedQuery: string,
): Promise<ExternalMarketplaceCard[]> {
  if (!canFetchMarketplacePreviews(provider)) return [];
  if (provider.id === "ebay") return tryEbayApiPreview(provider, normalizedQuery);
  return trySafeHtmlProviderPreview(provider, normalizedQuery);
}

export async function trySafeHtmlProviderPreview(
  provider: MarketplaceProvider,
  normalizedQuery: string,
): Promise<ExternalMarketplaceCard[]> {
  if (
    isNeverParseProvider(provider.id) ||
    provider.mode === "external_link_only" ||
    !canHtmlExtractMarketplaceProducts(provider)
  ) {
    return [];
  }
  if (provider.mode === "safe_api" || provider.mode !== "safe_html") {
    return [];
  }

  const searchUrl = provider.buildSearchUrl(normalizedQuery);
  try {
    await throttleProviderFetch();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(searchUrl, {
      signal: ac.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    if (!html || html.length < 200) return [];
    const slice = html.slice(0, 250_000);
    return extractProductCardsFromSearchHtml(provider, slice, normalizedQuery, searchUrl);
  } catch {
    return [];
  }
}
