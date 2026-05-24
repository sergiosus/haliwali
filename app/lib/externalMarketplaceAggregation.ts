/**
 * Safe external marketplace aggregation — no restricted-source parsing.
 */

import {
  MARKETPLACE_PREVIEW_MAX_PER_PROVIDER,
  MARKETPLACE_PREVIEW_MAX_TOTAL,
} from "./marketplacePageConfig";
import {
  buildRestrictedOutboundLinks,
  getAggregatableProviders,
  getMarketplaceProviderById,
  normalizeMarketplaceSearchQuery,
  type ExternalMarketplaceCard,
  type MarketplaceProvider,
  type MarketplaceProviderCategory,
  type MarketplaceProviderId,
} from "./externalMarketplaceProviders";
import {
  countFakeMarketplaceCards,
  filterRealMarketplaceCards,
} from "./marketplaceCardQuality";
import { readMarketplaceCache, writeMarketplaceCache } from "./externalMarketplaceCache";
import {
  tryMarketplaceProviderPreview,
  trySafeHtmlProviderPreview,
} from "./externalMarketplaceFetch";
import { enrichMarketplaceCardsForDisplay } from "./marketplaceDisplay";
import { buildProviderSearchActions, splitSelectedProvidersForSearch } from "./marketplacePageSearch";
import { prepareMarketplaceGatewayQuery } from "./marketplaceSearchPrepare";
import {
  getMarketplaceRealCardsAdapterIds,
  type MarketplaceProviderSearchAction,
} from "./marketplaceProviderGateway";
import {
  canFetchMarketplacePreviews,
  canHtmlExtractMarketplaceProducts,
} from "./externalMarketplaceProviders";

export type MarketplaceAggregationResult = {
  normalizedQuery: string;
  cards: ExternalMarketplaceCard[];
  restrictedLinks: { label: string; href: string; providerId: string }[];
  providerErrors: Record<string, string>;
};

const MAX_CARDS = 10;

export function isMarketplaceAggregationEnabled(): boolean {
  return process.env.DISABLE_MARKETPLACE_AGGREGATION !== "true";
}

/**
 * Aggregate safe marketplace results for a product (or auto) search.
 * Never parses Avito / Юла / 1688 / Taobao listings.
 */
export async function aggregateExternalMarketplaceResults(
  rawQuery: string,
  options?: {
    category?: MarketplaceProviderCategory;
    includeAuto?: boolean;
    maxCards?: number;
    includeRestrictedLinks?: boolean;
  },
): Promise<MarketplaceAggregationResult> {
  const normalizedQuery = normalizeMarketplaceSearchQuery(rawQuery);
  const empty: MarketplaceAggregationResult = {
    normalizedQuery,
    cards: [],
    restrictedLinks: [],
    providerErrors: {},
  };

  if (!isMarketplaceAggregationEnabled() || normalizedQuery.length < 2) {
    return empty;
  }

  const category = options?.category ?? "product";
  const maxCards = Math.min(Math.max(options?.maxCards ?? MAX_CARDS, 1), MAX_CARDS);
  const includeRestricted = options?.includeRestrictedLinks !== false;
  const includeAuto = options?.includeAuto === true;

  const cached = readMarketplaceCache(normalizedQuery, {
    maxCards,
    includeAuto,
    includeRestricted,
  });
  if (cached) return cached;

  const restrictedLinks = includeRestricted ?
    buildRestrictedOutboundLinks(normalizedQuery, category)
  : [];

  const providers = getAggregatableProviders(category);
  const autoProviders = options?.includeAuto ?
    getAggregatableProviders("auto").filter((p) => !providers.some((x) => x.id === p.id))
  : [];
  const allProviders = [...providers, ...autoProviders];

  const cards: ExternalMarketplaceCard[] = [];
  const providerErrors: Record<string, string> = {};

  for (const provider of allProviders) {
    if (cards.length >= maxCards) break;
    if (!canHtmlExtractMarketplaceProducts(provider)) {
      continue;
    }
    try {
      const batch = await trySafeHtmlProviderPreview(provider, normalizedQuery);
      for (const card of batch) {
        if (cards.length >= maxCards) break;
        if (filterRealMarketplaceCards([card], normalizedQuery).length > 0) {
          cards.push(card);
        }
      }
    } catch (e) {
      providerErrors[provider.id] = e instanceof Error ? e.message : "provider_failed";
    }
  }

  const realCards = filterRealMarketplaceCards(cards, normalizedQuery);
  const enriched = enrichMarketplaceCardsForDisplay(realCards, normalizedQuery);
  const result: MarketplaceAggregationResult = {
    normalizedQuery,
    cards: enriched,
    restrictedLinks,
    providerErrors,
  };

  writeMarketplaceCache(
    normalizedQuery,
    { maxCards, includeAuto, includeRestricted, scope: "default" },
    result,
  );

  return result;
}

export type MarketplacePageAggregationDebug = {
  normalizedQuery: string;
  providerRawCounts: Record<string, number>;
  filteredFakeCount: number;
  renderedCardCount: number;
};

export type MarketplacePageSearchResult = {
  normalizedQuery: string;
  queryVariants: string[];
  items: ExternalMarketplaceCard[];
  actions: MarketplaceProviderSearchAction[];
  selectedProviders: MarketplaceProviderId[];
};

function resolveProvidersForFetch(realCardsIds: MarketplaceProviderId[]): MarketplaceProvider[] {
  const allowed = new Set(getMarketplaceRealCardsAdapterIds());
  return realCardsIds
    .filter((id) => allowed.has(id))
    .map((id) => getMarketplaceProviderById(id))
    .filter((p): p is MarketplaceProvider => Boolean(p && canFetchMarketplacePreviews(p)));
}

/**
 * /marketplaces dashboard search — selected providers only.
 */
export async function aggregateMarketplacePageSearch(
  rawQuery: string,
  selectedProviderIds: readonly string[],
): Promise<MarketplacePageSearchResult> {
  const prepared = prepareMarketplaceGatewayQuery(rawQuery);
  const normalizedQuery = prepared.normalizedQuery;
  const { sanitized, realCardsIds } = splitSelectedProvidersForSearch(selectedProviderIds);
  const actions = buildProviderSearchActions(sanitized, rawQuery);

  const empty: MarketplacePageSearchResult = {
    normalizedQuery,
    queryVariants: prepared.variants,
    items: [],
    actions,
    selectedProviders: sanitized,
  };

  if (!isMarketplaceAggregationEnabled() || normalizedQuery.length < 2) {
    return empty;
  }

  const providerFilter = realCardsIds.slice().sort().join(",");
  const cacheOpts = {
    maxCards: MARKETPLACE_PREVIEW_MAX_TOTAL,
    includeAuto: false,
    includeRestricted: false,
    scope: "page" as const,
    providerFilter,
  };
  const cached = readMarketplaceCache(normalizedQuery, cacheOpts);
  if (cached) {
    const real = filterRealMarketplaceCards(cached.cards, normalizedQuery).slice(
      0,
      MARKETPLACE_PREVIEW_MAX_TOTAL,
    );
    const enriched = enrichMarketplaceCardsForDisplay(real, normalizedQuery);
    return {
      normalizedQuery,
      queryVariants: prepared.variants,
      items: enriched,
      actions,
      selectedProviders: sanitized,
    };
  }

  const providers = resolveProvidersForFetch(realCardsIds);
  const providerRawCounts: Record<string, number> = {};

  const perProviderBatches = await Promise.all(
    providers.map(async (provider) => {
      try {
        const batch = await tryMarketplaceProviderPreview(provider, normalizedQuery);
        const accepted: ExternalMarketplaceCard[] = [];
        for (const card of batch) {
          if (accepted.length >= MARKETPLACE_PREVIEW_MAX_PER_PROVIDER) break;
          if (filterRealMarketplaceCards([card], normalizedQuery).length > 0) {
            accepted.push(card);
          }
        }
        providerRawCounts[provider.id] = accepted.length;
        if (process.env.NODE_ENV !== "test" && accepted.length === 0) {
          console.log(`[MP_PROVIDER] ${provider.id} raw=0 accepted=0 (fetch or quality gate)`);
        }
        return accepted;
      } catch {
        providerRawCounts[provider.id] = 0;
        return [] as ExternalMarketplaceCard[];
      }
    }),
  );

  const rawCards: ExternalMarketplaceCard[] = [];
  for (const accepted of perProviderBatches) {
    for (const card of accepted) {
      if (rawCards.length >= MARKETPLACE_PREVIEW_MAX_TOTAL) break;
      rawCards.push(card);
    }
    if (rawCards.length >= MARKETPLACE_PREVIEW_MAX_TOTAL) break;
  }

  const filteredFakeCount = countFakeMarketplaceCards(rawCards, normalizedQuery);
  const realCards = filterRealMarketplaceCards(rawCards, normalizedQuery).slice(
    0,
    MARKETPLACE_PREVIEW_MAX_TOTAL,
  );
  const enriched = enrichMarketplaceCardsForDisplay(realCards, normalizedQuery);

  if (process.env.NODE_ENV !== "test") {
    console.log("[MarketplaceSearch]", {
      normalizedQuery,
      providerRawCounts,
      filteredFakeCount,
      renderedCardCount: enriched.length,
      realCardsIds,
      actionCount: actions.length,
    });
  }

  writeMarketplaceCache(normalizedQuery, cacheOpts, {
    normalizedQuery,
    cards: enriched,
    restrictedLinks: [],
    providerErrors: {},
  });

  return {
    normalizedQuery,
    queryVariants: prepared.variants,
    items: enriched,
    actions,
    selectedProviders: sanitized,
  };
}
