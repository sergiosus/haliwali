import type { MarketplaceProviderId } from "./externalMarketplaceProviders";
import { MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS } from "./marketplaceProviderGateway";

const SELECTED_KEY = "haliwali-marketplace-selected-providers";
const EXPANDED_KEY = "haliwali-marketplace-expanded-groups";

export function readSelectedProviderIds(): MarketplaceProviderId[] {
  if (typeof window === "undefined") return [...MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS];
  try {
    const raw = window.localStorage.getItem(SELECTED_KEY);
    if (!raw) return [...MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS];
    return parsed.filter((x): x is MarketplaceProviderId => typeof x === "string");
  } catch {
    return [...MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS];
  }
}

export function writeSelectedProviderIds(ids: readonly MarketplaceProviderId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SELECTED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

export function readExpandedGroupIds(defaultExpanded: readonly string[]): string[] {
  if (typeof window === "undefined") return [...defaultExpanded];
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    if (!raw) return [...defaultExpanded];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...defaultExpanded];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [...defaultExpanded];
  }
}

export function writeExpandedGroupIds(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function parseProvidersUrlParam(param: string | null): MarketplaceProviderId[] | null {
  if (!param?.trim()) return null;
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MarketplaceProviderId[];
}
