/**
 * eBay product previews via Buy Browse API (official, no HTML scrape).
 */

import { searchEbayItemSummaries, isEbayBrowseApiConfigured } from "./ebayBrowseApi";
import type { ExternalMarketplaceCard, MarketplaceProvider } from "./externalMarketplaceProviders";
import { MARKETPLACE_PREVIEW_MAX_PER_PROVIDER } from "./marketplacePageConfig";
import { filterRealMarketplaceCards } from "./marketplaceCardQuality";

export { isEbayBrowseApiConfigured };

export async function tryEbayApiPreview(
  _provider: MarketplaceProvider,
  normalizedQuery: string,
): Promise<ExternalMarketplaceCard[]> {
  if (!isEbayBrowseApiConfigured()) return [];

  try {
    const batch = await searchEbayItemSummaries(normalizedQuery, 8);
    const accepted: ExternalMarketplaceCard[] = [];
    for (const card of batch) {
      if (accepted.length >= MARKETPLACE_PREVIEW_MAX_PER_PROVIDER) break;
      if (filterRealMarketplaceCards([card], normalizedQuery).length > 0) {
        accepted.push(card);
      }
    }
    return accepted;
  } catch {
    return [];
  }
}
