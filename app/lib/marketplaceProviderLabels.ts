import type { MarketplaceProviderId } from "./externalMarketplaceProviders";

const PROVIDER_NAME_RU: Partial<Record<MarketplaceProviderId, string>> = {
  aliexpress: "АлиЭкспресс",
  ebay: "eBay",
  amazon: "Амазон",
  ozon: "Озон",
  wildberries: "Вайлдберриз",
  drom: "Дром",
  yandex_market: "Яндекс Маркет",
  megamarket: "Мегамаркет",
  exist: "Exist",
  emex: "Emex",
  autodoc: "Autodoc",
  alibaba: "Alibaba",
  "1688": "1688",
  taobao: "Taobao",
  tmall: "Tmall",
  jd: "JD.com",
  made_in_china: "Made-in-China",
  dhgate: "DHgate",
  walmart: "Walmart",
  etsy: "Etsy",
  ebay_eu: "eBay EU",
  amazon_eu: "Amazon EU",
  allegro: "Allegro",
  kaufland: "Kaufland",
  rakuten_jp: "Rakuten Japan",
  yahoo_auctions_jp: "Yahoo Auctions Japan",
  buyee: "Buyee",
  qoo10: "Qoo10",
  avito: "Авито",
  youla: "Юла",
};

export function providerNameRu(id: MarketplaceProviderId, fallback: string): string {
  return PROVIDER_NAME_RU[id] ?? fallback;
}
