/** Chip visuals for marketplace product cards (by provider id). */
import type { MarketplaceProviderId } from "./externalMarketplaceProviders";

export type MarketplaceChipVisual = {
  abbr: string;
  brandColor: string;
};

const DEFAULT_CHIP: MarketplaceChipVisual = { abbr: "•", brandColor: "#888888" };

export const MARKETPLACE_CHIP_VISUALS: Record<MarketplaceProviderId, MarketplaceChipVisual> = {
  ozon: { abbr: "Oz", brandColor: "#005bff" },
  wildberries: { abbr: "WB", brandColor: "#cb11ab" },
  yandex_market: { abbr: "ЯМ", brandColor: "#ffcc00" },
  megamarket: { abbr: "ММ", brandColor: "#00b956" },
  drom: { abbr: "Dr", brandColor: "#1a1a1a" },
  exist: { abbr: "Ex", brandColor: "#e30613" },
  emex: { abbr: "Em", brandColor: "#003399" },
  autodoc: { abbr: "Ad", brandColor: "#f5a623" },
  aliexpress: { abbr: "AE", brandColor: "#ff4747" },
  alibaba: { abbr: "Ab", brandColor: "#ff6a00" },
  "1688": { abbr: "16", brandColor: "#ff6a00" },
  taobao: { abbr: "Tb", brandColor: "#ff5000" },
  tmall: { abbr: "Tm", brandColor: "#ff0036" },
  jd: { abbr: "JD", brandColor: "#e1251b" },
  made_in_china: { abbr: "Mi", brandColor: "#c41230" },
  dhgate: { abbr: "DH", brandColor: "#2e9fd6" },
  ebay: { abbr: "eB", brandColor: "#0064d2" },
  amazon: { abbr: "Am", brandColor: "#ff9900" },
  walmart: { abbr: "Wa", brandColor: "#0071dc" },
  etsy: { abbr: "Et", brandColor: "#f45800" },
  ebay_eu: { abbr: "eU", brandColor: "#0064d2" },
  amazon_eu: { abbr: "AE", brandColor: "#ff9900" },
  allegro: { abbr: "Al", brandColor: "#ff5a00" },
  kaufland: { abbr: "Kf", brandColor: "#e10915" },
  rakuten_jp: { abbr: "Rk", brandColor: "#bf0000" },
  yahoo_auctions_jp: { abbr: "Ya", brandColor: "#6001d2" },
  buyee: { abbr: "By", brandColor: "#00a0e9" },
  qoo10: { abbr: "Q1", brandColor: "#7b2cbf" },
  avito: { abbr: "Av", brandColor: "#00aaff" },
  youla: { abbr: "Ю", brandColor: "#7b61ff" },
};

export function getMarketplaceChipVisual(id: MarketplaceProviderId): MarketplaceChipVisual {
  return MARKETPLACE_CHIP_VISUALS[id] ?? DEFAULT_CHIP;
}
