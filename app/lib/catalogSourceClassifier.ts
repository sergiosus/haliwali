import type { CatalogSourceType } from "./catalogExtractionTypes";

const VK_HOSTS = /(^|\.)vk\.(com|ru)$/i;
const LISTING_HOSTS =
  /(^|\.)(avito\.ru|youla\.ru|irr\.ru|farpost\.ru|drom\.ru|auto\.ru|cian\.ru|domclick\.ru)/i;

export function classifySourceUrl(url: URL): CatalogSourceType {
  const host = url.hostname.toLowerCase();
  if (VK_HOSTS.test(host)) return "vk";
  if (LISTING_HOSTS.test(host)) return "listing";
  return "website";
}

export function guessSourceTypeFromDomain(domain: string): CatalogSourceType {
  try {
    return classifySourceUrl(new URL(`https://${domain.replace(/^https?:\/\//, "")}`));
  } catch {
    return "website";
  }
}
