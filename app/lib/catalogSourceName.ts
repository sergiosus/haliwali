import {
  CATALOG_MARKETPLACE_SOURCES,
  type CatalogSourceName,
  type OfferListingSourceId,
} from "./catalogSourceOfferTypes";

export function offerListingSourceFromUrl(url: string): OfferListingSourceId | null {
  const lower = url.toLowerCase();
  if (lower.includes("avito.ru")) return "avito";
  if (lower.includes("youla.ru")) return "youla";
  if (lower.includes("drom.ru") || lower.includes("auto.ru")) return "drom";
  if (lower.includes("vk.com") || lower.includes("vk.ru")) return "vk";
  return null;
}

const AVITO = /(^|\.)avito\.ru$/i;
const DROM = /(^|\.)(drom\.ru|auto\.ru)$/i;
const VK = /(^|\.)vk\.(com|ru)$/i;
const YOULA = /(^|\.)youla\.ru$/i;

export function catalogSourceNameFromHostname(hostname: string): CatalogSourceName {
  const host = hostname.trim().toLowerCase();
  if (AVITO.test(host)) return "avito";
  if (DROM.test(host)) return "drom";
  if (VK.test(host)) return "vk";
  if (YOULA.test(host)) return "youla";
  return "other";
}

export { CATALOG_MARKETPLACE_SOURCES };

export function catalogSourceNameFromUrl(rawUrl: string): CatalogSourceName {
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return catalogSourceNameFromHostname(url.hostname);
    }
  } catch {
    /* ignore */
  }
  return "other";
}

export const CATALOG_SOURCE_NAME_LABEL: Record<CatalogSourceName, string> = {
  avito: "Avito",
  drom: "Drom",
  vk: "VK",
  youla: "Юла",
  company_site: "Сайт компании",
  other: "Источник",
};

export function catalogSourceNameLabel(name: CatalogSourceName | string): string {
  const key = name as CatalogSourceName;
  return CATALOG_SOURCE_NAME_LABEL[key] ?? CATALOG_SOURCE_NAME_LABEL.other;
}
