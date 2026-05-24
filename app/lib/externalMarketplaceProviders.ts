/**
 * External marketplace provider registry (legal/safe MVP).
 * Restricted providers: outbound search links only — never parsed here.
 */

import { isEbayBrowseApiConfigured } from "./ebayBrowseApi";
import { marketplacePrimaryQueryText } from "./marketplaceSearchPrepare";
import { providerNameRu } from "./marketplaceProviderLabels";

export type MarketplaceProviderMode = "safe_api" | "safe_html" | "external_link_only";

export type MarketplaceProviderCategory = "product" | "auto";

export type MarketplaceProviderId =
  | "aliexpress"
  | "ebay"
  | "amazon"
  | "ozon"
  | "wildberries"
  | "drom"
  | "avito"
  | "youla"
  | "1688"
  | "taobao"
  | "yandex_market"
  | "megamarket"
  | "exist"
  | "emex"
  | "autodoc"
  | "alibaba"
  | "tmall"
  | "jd"
  | "made_in_china"
  | "dhgate"
  | "walmart"
  | "etsy"
  | "ebay_eu"
  | "amazon_eu"
  | "allegro"
  | "kaufland"
  | "rakuten_jp"
  | "yahoo_auctions_jp"
  | "buyee"
  | "qoo10";

export type MarketplaceProvider = {
  id: MarketplaceProviderId;
  name: string;
  type: "global" | "ru" | "cn" | "jp" | "eu";
  enabled: boolean;
  mode: MarketplaceProviderMode;
  /** If true — no HTML/API parsing; search URL only. */
  restricted: boolean;
  allowedCategories: readonly MarketplaceProviderCategory[];
  buildSearchUrl: (normalizedQuery: string) => string;
};

export type ExternalMarketplaceCard = {
  providerId: MarketplaceProviderId;
  sourceName: string;
  title: string;
  snippet: string | null;
  price: string | null;
  imageUrl: string | null;
  externalUrl: string;
  linkOnly: boolean;
};

const enc = (q: string) => encodeURIComponent(q);

const linkOnly = (
  id: MarketplaceProviderId,
  name: string,
  type: MarketplaceProvider["type"],
  buildSearchUrl: (q: string) => string,
  opts?: { restricted?: boolean; categories?: readonly MarketplaceProviderCategory[] },
): MarketplaceProvider => ({
  id,
  name,
  type,
  enabled: true,
  mode: "external_link_only",
  restricted: opts?.restricted ?? false,
  allowedCategories: opts?.categories ?? ["product"],
  buildSearchUrl,
});

export const MARKETPLACE_PROVIDERS: readonly MarketplaceProvider[] = [
  {
    id: "aliexpress",
    name: "AliExpress",
    type: "global",
    enabled: true,
    mode: "safe_html",
    restricted: false,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://www.aliexpress.com/wholesale?SearchText=${enc(q)}`,
  },
  {
    id: "ebay",
    name: "eBay",
    type: "global",
    enabled: true,
    mode: "external_link_only",
    restricted: false,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}`,
  },
  {
    id: "amazon",
    name: "Amazon",
    type: "global",
    enabled: true,
    mode: "external_link_only",
    restricted: false,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://www.amazon.com/s?k=${enc(q)}`,
  },
  linkOnly("ozon", "Ozon", "ru", (q) => `https://www.ozon.ru/search/?text=${enc(q)}`),
  linkOnly(
    "wildberries",
    "Wildberries",
    "ru",
    (q) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${enc(q)}`,
  ),
  linkOnly("yandex_market", "Яндекс Маркет", "ru", (q) => `https://market.yandex.ru/search?text=${enc(q)}`),
  linkOnly("megamarket", "Мегамаркет", "ru", (q) => `https://megamarket.ru/catalog/?q=${enc(q)}`),
  {
    id: "drom",
    name: "Дром",
    type: "ru",
    enabled: true,
    mode: "external_link_only",
    restricted: false,
    allowedCategories: ["auto", "product"],
    buildSearchUrl: (q) => `https://www.drom.ru/catalog/?q=${enc(q)}`,
  },
  linkOnly("exist", "Exist", "ru", (q) => `https://www.exist.ru/Price/?pcode=all&search=${enc(q)}`, {
    categories: ["auto"],
  }),
  linkOnly("emex", "Emex", "ru", (q) => `https://emex.ru/products/search?query=${enc(q)}`, {
    categories: ["auto"],
  }),
  linkOnly("autodoc", "Autodoc", "ru", (q) => `https://www.autodoc.ru/search?keyword=${enc(q)}`, {
    categories: ["auto"],
  }),
  linkOnly("alibaba", "Alibaba", "cn", (q) => `https://www.alibaba.com/trade/search?SearchText=${enc(q)}`),
  {
    id: "1688",
    name: "1688",
    type: "cn",
    enabled: true,
    mode: "external_link_only",
    restricted: true,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${enc(q)}`,
  },
  {
    id: "taobao",
    name: "Taobao",
    type: "cn",
    enabled: true,
    mode: "external_link_only",
    restricted: true,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://s.taobao.com/search?q=${enc(q)}`,
  },
  linkOnly("tmall", "Tmall", "cn", (q) => `https://list.tmall.com/search_product.htm?q=${enc(q)}`, {
    restricted: true,
  }),
  linkOnly("jd", "JD.com", "cn", (q) => `https://search.jd.com/Search?keyword=${enc(q)}`, { restricted: true }),
  linkOnly(
    "made_in_china",
    "Made-in-China",
    "cn",
    (q) => `https://www.made-in-china.com/productdirectory.do?word=${enc(q)}`,
  ),
  linkOnly("dhgate", "DHgate", "cn", (q) => `https://www.dhgate.com/wholesale/search.do?searchkey=${enc(q)}`),
  linkOnly("walmart", "Walmart", "global", (q) => `https://www.walmart.com/search?q=${enc(q)}`),
  linkOnly("etsy", "Etsy", "global", (q) => `https://www.etsy.com/search?q=${enc(q)}`),
  linkOnly("ebay_eu", "eBay EU", "eu", (q) => `https://www.ebay.co.uk/sch/i.html?_nkw=${enc(q)}`),
  linkOnly("amazon_eu", "Amazon EU", "eu", (q) => `https://www.amazon.de/s?k=${enc(q)}`),
  linkOnly("allegro", "Allegro", "eu", (q) => `https://allegro.pl/listing?string=${enc(q)}`),
  linkOnly("kaufland", "Kaufland", "eu", (q) => `https://www.kaufland.de/s/?search_value=${enc(q)}`),
  linkOnly(
    "rakuten_jp",
    "Rakuten Japan",
    "jp",
    (q) => `https://search.rakuten.co.jp/search/mall/${enc(q)}/`,
    { restricted: true },
  ),
  linkOnly(
    "yahoo_auctions_jp",
    "Yahoo Auctions Japan",
    "jp",
    (q) => `https://auctions.yahoo.co.jp/search/search?p=${enc(q)}`,
    { restricted: true },
  ),
  linkOnly("buyee", "Buyee", "jp", (q) => `https://buyee.jp/item/search/query/${enc(q)}`),
  linkOnly("qoo10", "Qoo10", "jp", (q) => `https://www.qoo10.jp/s/?keyword=${enc(q)}`),
  {
    id: "avito",
    name: "Avito",
    type: "ru",
    enabled: true,
    mode: "external_link_only",
    restricted: true,
    allowedCategories: ["product", "auto"],
    buildSearchUrl: (q) => `https://www.avito.ru/all?q=${enc(q)}`,
  },
  {
    id: "youla",
    name: "Юла",
    type: "ru",
    enabled: true,
    mode: "external_link_only",
    restricted: true,
    allowedCategories: ["product"],
    buildSearchUrl: (q) => `https://youla.ru/search?q=${enc(q)}`,
  },
];

export function normalizeMarketplaceSearchQuery(raw: string): string {
  return marketplacePrimaryQueryText(raw);
}

/** Stable outbound search URL for a gateway provider (normalized query). */
export function buildMarketplaceProviderSearchUrl(
  id: MarketplaceProviderId,
  rawQuery: string,
): string | null {
  const provider = getMarketplaceProviderById(id);
  if (!provider) return null;
  const q = normalizeMarketplaceSearchQuery(rawQuery).trim() || "товары";
  return provider.buildSearchUrl(q);
}

export function getEnabledMarketplaceProviders(
  category: MarketplaceProviderCategory = "product",
): MarketplaceProvider[] {
  return MARKETPLACE_PROVIDERS.filter(
    (p) => p.enabled && p.allowedCategories.includes(category),
  );
}

export function getRestrictedLinkOnlyProviders(
  category: MarketplaceProviderCategory = "product",
): MarketplaceProvider[] {
  return getEnabledMarketplaceProviders(category).filter((p) => p.restricted);
}

export function getAggregatableProviders(
  category: MarketplaceProviderCategory = "product",
): MarketplaceProvider[] {
  return getEnabledMarketplaceProviders(category).filter((p) => !p.restricted);
}

export function getMarketplaceProviderById(
  id: MarketplaceProviderId,
): MarketplaceProvider | undefined {
  return MARKETPLACE_PROVIDERS.find((p) => p.id === id);
}

export function buildLinkOnlyCard(
  provider: MarketplaceProvider,
  normalizedQuery: string,
): ExternalMarketplaceCard {
  const q = normalizedQuery.trim();
  return {
    providerId: provider.id,
    sourceName: provider.name,
    title: q ? `Товары по запросу «${q}»` : `Товары на ${provider.name}`,
    snippet: null,
    price: null,
    imageUrl: null,
    externalUrl: provider.buildSearchUrl(q),
    linkOnly: true,
  };
}

export function buildRestrictedOutboundLinks(
  rawQuery: string,
  category: MarketplaceProviderCategory = "product",
): { label: string; href: string; providerId: MarketplaceProviderId }[] {
  const q = normalizeMarketplaceSearchQuery(rawQuery);
  if (!q) return [];
  return getRestrictedLinkOnlyProviders(category).map((p) => ({
    providerId: p.id,
    label: `Искать на ${providerNameRu(p.id, p.name)}`,
    href: p.buildSearchUrl(q),
  }));
}

/** Provider ids that must never be HTML-parsed (gateway is link-only or restricted). */
export const NEVER_PARSE_PROVIDER_IDS: readonly MarketplaceProviderId[] = [
  "ozon",
  "wildberries",
  "yandex_market",
  "megamarket",
  "drom",
  "exist",
  "emex",
  "autodoc",
  "amazon",
  "walmart",
  "etsy",
  "alibaba",
  "1688",
  "taobao",
  "tmall",
  "jd",
  "made_in_china",
  "dhgate",
  "ebay",
  "ebay_eu",
  "amazon_eu",
  "allegro",
  "kaufland",
  "rakuten_jp",
  "yahoo_auctions_jp",
  "buyee",
  "qoo10",
  "avito",
  "youla",
];

export function isNeverParseProvider(id: string): boolean {
  return id !== "aliexpress" && (NEVER_PARSE_PROVIDER_IDS as readonly string[]).includes(id);
}

/** Only AliExpress may use HTML extraction today; eBay when API credentials exist. */
export function canHtmlExtractMarketplaceProducts(provider: MarketplaceProvider): boolean {
  if (provider.id === "aliexpress" && provider.mode === "safe_html") return true;
  return false;
}

/** Providers allowed to return live preview cards on /marketplaces. */
export function canFetchMarketplacePreviews(provider: MarketplaceProvider): boolean {
  if (canHtmlExtractMarketplaceProducts(provider)) return true;
  return provider.id === "ebay" && isEbayBrowseApiConfigured();
}
