import { getBlacklistReason } from "./catalogDiscoverBlacklist";

export type DiscoverySourceType =
  | "company_site"
  | "vk_group"
  | "small_directory"
  | "listing"
  | "aggregator"
  | "unknown";

const VK_RE = /(^|\.)vk\.(com|ru)$/i;
const LISTING_RE =
  /(^|\.)(avito\.ru|youla\.ru|irr\.ru|farpost\.ru|drom\.ru|auto\.ru|cian\.ru|domclick\.ru)/i;
const DIRECTORY_RE =
  /(^|\.)(sprav|catalog|firmy|companies|org|biz|guide|directory|spravochnik|yellowpages)/i;
const DIRECTORY_PATH_RE = /\/(company|firm|org|catalog|card|profile|business)\//i;

export function detectDiscoverySourceType(
  domain: string,
  url: string,
  title?: string,
): DiscoverySourceType {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const bl = getBlacklistReason(host, url);
  if (bl === "aggregator") return "aggregator";

  if (VK_RE.test(host)) return "vk_group";
  if (LISTING_RE.test(host)) return "listing";

  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    /* ignore */
  }

  if (DIRECTORY_RE.test(host) || DIRECTORY_PATH_RE.test(path)) return "small_directory";

  const t = (title ?? "").toLowerCase();
  if (/(каталог|справочник|все компании|организации города)/i.test(t)) return "small_directory";

  if (host && !bl) return "company_site";
  return "unknown";
}

export const DISCOVERY_SOURCE_LABEL: Record<DiscoverySourceType, string> = {
  company_site: "Сайт компании",
  vk_group: "VK",
  small_directory: "Справочник",
  listing: "Объявление",
  aggregator: "Агрегатор",
  unknown: "Неизвестно",
};
