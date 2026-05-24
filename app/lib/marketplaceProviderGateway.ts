/**
 * /marketplaces gateway — regional catalog and card-adapter policy.
 */

import type { MarketplaceProviderId } from "./externalMarketplaceProviders";

export type MarketplaceProviderSurfaceMode = "real_cards" | "link_only";

export type MarketplaceGatewayProvider = {
  id: MarketplaceProviderId;
  name: string;
  regionLabel: string;
  deliveryNote: string;
  brandColor: string;
  abbr: string;
  surfaceMode: MarketplaceProviderSurfaceMode;
};

/** eBay product API — enable when official credentials are configured. */
export function isEbayRealCardsAdapterEnabled(): boolean {
  return Boolean(
    process.env.EBAY_CLIENT_ID?.trim() ||
      process.env.EBAY_APP_ID?.trim() ||
      process.env.EBAY_OAUTH_CLIENT_ID?.trim(),
  );
}

/** Providers that may return in-page product cards (strict quality gate). */
export function getMarketplaceRealCardsAdapterIds(): readonly MarketplaceProviderId[] {
  const ids: MarketplaceProviderId[] = ["aliexpress"];
  if (isEbayRealCardsAdapterEnabled()) ids.push("ebay");
  return ids;
}

export function isRealCardsMarketplaceAdapter(id: MarketplaceProviderId): boolean {
  return (getMarketplaceRealCardsAdapterIds() as readonly string[]).includes(id);
}

export function isLinkOnlyMarketplaceProvider(id: MarketplaceProviderId): boolean {
  return !isRealCardsMarketplaceAdapter(id);
}

/** Gateway mode per page provider — switch REAL_CARDS when API is plugged in (Part 12). */
export function marketplaceProviderSurfaceMode(
  id: MarketplaceProviderId,
): MarketplaceProviderSurfaceMode {
  return isRealCardsMarketplaceAdapter(id) ? "real_cards" : "link_only";
}

/** All providers on /marketplaces with current surface mode (documentation + future APIs). */
export function marketplaceProviderModeTable(): ReadonlyArray<{
  id: MarketplaceProviderId;
  name: string;
  mode: MarketplaceProviderSurfaceMode;
  groupTitle: string;
}> {
  return MARKETPLACE_REGION_GROUPS.flatMap((group) =>
    group.providers.map((p) => ({
      id: p.id,
      name: p.name,
      mode: p.surfaceMode,
      groupTitle: group.title,
    })),
  );
}

export type MarketplaceRegionGroup = {
  id: string;
  title: string;
  providers: readonly MarketplaceGatewayProvider[];
};

function gp(
  id: MarketplaceProviderId,
  name: string,
  regionLabel: string,
  deliveryNote: string,
  brandColor: string,
  abbr: string,
): MarketplaceGatewayProvider {
  return {
    id,
    name,
    regionLabel,
    deliveryNote,
    brandColor,
    abbr,
    surfaceMode: isRealCardsMarketplaceAdapter(id) ? "real_cards" : "link_only",
  };
}

export const MARKETPLACE_REGION_GROUPS: readonly MarketplaceRegionGroup[] = [
  {
    id: "russia",
    title: "Россия",
    providers: [
      gp("ozon", "Ozon", "Россия", "Доставка по России", "#005bff", "Oz"),
      gp("wildberries", "Wildberries", "Россия", "Доставка по России", "#cb11ab", "WB"),
      gp("yandex_market", "Яндекс Маркет", "Россия", "Доставка по России", "#ffcc00", "ЯМ"),
      gp("megamarket", "Мегамаркет", "Россия", "Доставка по России", "#00b956", "ММ"),
      gp("drom", "Drom", "Россия", "Россия, авто и запчасти", "#1a1a1a", "Dr"),
      gp("exist", "Exist", "Россия", "Автозапчасти, доставка по РФ", "#e30613", "Ex"),
      gp("emex", "Emex", "Россия", "Автозапчасти, доставка по РФ", "#003399", "Em"),
      gp("autodoc", "Autodoc", "Россия", "Автозапчасти, доставка по РФ", "#f5a623", "Ad"),
    ],
  },
  {
    id: "china",
    title: "Китай",
    providers: [
      gp("aliexpress", "AliExpress", "Китай", "Доставка в РФ зависит от товара", "#ff4747", "AE"),
      gp("alibaba", "Alibaba", "Китай", "Опт и B2B, часто через посредника", "#ff6a00", "Ab"),
      gp("1688", "1688", "Китай", "Через посредника", "#ff6a00", "16"),
      gp("taobao", "Taobao", "Китай", "Через посредника", "#ff5000", "Tb"),
      gp("tmall", "Tmall", "Китай", "Через посредника", "#ff0036", "Tm"),
      gp("jd", "JD.com", "Китай", "Через посредника", "#e1251b", "JD"),
      gp("made_in_china", "Made-in-China", "Китай", "B2B, доставка по договорённости", "#c41230", "Mi"),
      gp("dhgate", "DHgate", "Китай", "Опт, доставка зависит от продавца", "#2e9fd6", "DH"),
    ],
  },
  {
    id: "usa",
    title: "США",
    providers: [
      gp("ebay", "eBay", "США", "Международная доставка, часто через посредника", "#0064d2", "eB"),
      gp("amazon", "Amazon", "США", "Чаще через посредника", "#ff9900", "Am"),
      gp("walmart", "Walmart", "США", "Доставка в США, из РФ — посредник", "#0071dc", "Wa"),
      gp("etsy", "Etsy", "США", "Хендмейд, доставка от продавца", "#f45800", "Et"),
    ],
  },
  {
    id: "europe",
    title: "Европа",
    providers: [
      gp("ebay_eu", "eBay EU", "Европа", "Доставка по ЕС, из РФ — посредник", "#0064d2", "eU"),
      gp("amazon_eu", "Amazon EU", "Европа", "Доставка по ЕС, из РФ — посредник", "#ff9900", "AE"),
      gp("allegro", "Allegro", "Европа", "Польша и ЕС", "#ff5a00", "Al"),
      gp("kaufland", "Kaufland", "Европа", "Германия и ЕС", "#e10915", "Kf"),
    ],
  },
  {
    id: "japan-asia",
    title: "Япония / Азия",
    providers: [
      gp("rakuten_jp", "Rakuten Japan", "Япония", "Через посредника", "#bf0000", "Rk"),
      gp("yahoo_auctions_jp", "Yahoo Auctions Japan", "Япония", "Аукционы, через посредника", "#6001d2", "Ya"),
      gp("buyee", "Buyee", "Япония", "Сервис выкупа и доставки", "#00a0e9", "By"),
      gp("qoo10", "Qoo10", "Азия", "Сингапур, Корея, Япония", "#7b2cbf", "Q1"),
    ],
  },
] as const;

export const MARKETPLACE_GATEWAY_NOTE =
  "Единый поиск по маркетплейсам: Haliwali подберёт запрос и откроет поиск на выбранных площадках. Карточки товаров на странице — только с проверенных источников.";

export const MARKETPLACE_EMPTY_QUERY_HINT =
  "Введите запрос и нажмите «Найти» — появятся кнопки поиска по странам и площадкам. Слева отметьте нужные маркетплейсы.";

export function findGatewayRegionGroup(
  id: MarketplaceProviderId,
): MarketplaceRegionGroup | null {
  for (const group of MARKETPLACE_REGION_GROUPS) {
    if (group.providers.some((p) => p.id === id)) return group;
  }
  return null;
}

/** Short badge for delivery/intermediary hints on action cards. */
export function marketplaceDeliveryBadge(deliveryNote: string): string | null {
  const n = deliveryNote.toLowerCase();
  if (n.includes("посредник")) return "через посредника";
  if (n.includes("зависит от продавца") || n.includes("зависит от товара")) {
    return "доставка зависит от продавца";
  }
  if (n.includes("b2b") || n.includes("опт")) return "опт / B2B";
  if (n.includes("аукцион")) return "аукционы";
  return null;
}

/** Default checkbox selection on first visit. */
export const MARKETPLACE_DEFAULT_SELECTED_PROVIDER_IDS: readonly MarketplaceProviderId[] = [
  "ozon",
  "wildberries",
  "aliexpress",
  "ebay",
  "drom",
] as const;

export const MARKETPLACE_DEFAULT_EXPANDED_GROUP_IDS: readonly string[] = ["russia", "china"] as const;

const PAGE_PROVIDER_SET = new Set(
  MARKETPLACE_REGION_GROUPS.flatMap((g) => g.providers.map((p) => p.id)),
);

export function allGatewayProviderIds(): MarketplaceProviderId[] {
  return [...PAGE_PROVIDER_SET];
}

export function isMarketplacePageProviderId(id: string): id is MarketplaceProviderId {
  return PAGE_PROVIDER_SET.has(id as MarketplaceProviderId);
}

export function findGatewayProvider(id: MarketplaceProviderId): MarketplaceGatewayProvider | null {
  for (const group of MARKETPLACE_REGION_GROUPS) {
    const p = group.providers.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

export function sanitizeSelectedProviderIds(ids: readonly string[]): MarketplaceProviderId[] {
  const seen = new Set<MarketplaceProviderId>();
  const out: MarketplaceProviderId[] = [];
  for (const id of ids) {
    if (!isMarketplacePageProviderId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type MarketplaceProviderSearchAction = {
  providerId: MarketplaceProviderId;
  name: string;
  regionLabel: string;
  deliveryNote: string;
  deliveryBadge: string | null;
  href: string;
  normalizedQuery: string;
  groupId: string;
  groupTitle: string;
};

export type MarketplaceProviderSearchActionGroup = {
  groupId: string;
  groupTitle: string;
  actions: MarketplaceProviderSearchAction[];
};

export function groupProviderSearchActions(
  actions: readonly MarketplaceProviderSearchAction[],
): MarketplaceProviderSearchActionGroup[] {
  const byProvider = new Map(actions.map((a) => [a.providerId, a]));
  const groups: MarketplaceProviderSearchActionGroup[] = [];
  for (const group of MARKETPLACE_REGION_GROUPS) {
    const inGroup: MarketplaceProviderSearchAction[] = [];
    for (const p of group.providers) {
      const action = byProvider.get(p.id);
      if (action) inGroup.push(action);
    }
    if (inGroup.length > 0) {
      groups.push({ groupId: group.id, groupTitle: group.title, actions: inGroup });
    }
  }
  return groups;
}

/** @deprecated Use MarketplaceProviderSearchAction */
export type MarketplaceLinkOnlyAction = MarketplaceProviderSearchAction;
