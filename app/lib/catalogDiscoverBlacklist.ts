/** Discovery domain blacklist — hidden from default results, not deleted. */

export type BlacklistReason = "blacklisted" | "aggregator" | "blocked_fetch";

const BLACKLIST_PATTERNS: { re: RegExp; reason: BlacklistReason }[] = [
  { re: /(^|\.)google\./i, reason: "blacklisted" },
  { re: /(^|\.)yandex\.(ru|com|net)/i, reason: "blacklisted" },
  { re: /(^|\.)2gis\./i, reason: "blacklisted" },
  { re: /(^|\.)maps\./i, reason: "blacklisted" },
  { re: /(^|\.)avito\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)drom\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)auto\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)wikipedia\.org/i, reason: "blacklisted" },
  { re: /(^|\.)youtube\.com/i, reason: "blacklisted" },
  { re: /(^|\.)youtu\.be/i, reason: "blacklisted" },
  { re: /(^|\.)rutube\.ru/i, reason: "blacklisted" },
  { re: /zen\.yandex\./i, reason: "blacklisted" },
  { re: /(^|\.)pinterest\./i, reason: "blacklisted" },
  { re: /(^|\.)hh\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)profi\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)youdo\./i, reason: "blacklisted" },
  { re: /(^|\.)flamp\./i, reason: "aggregator" },
  { re: /(^|\.)otzovik\./i, reason: "aggregator" },
  { re: /(^|\.)zoon\./i, reason: "aggregator" },
  { re: /(^|\.)yell\./i, reason: "aggregator" },
  { re: /(^|\.)spravker\./i, reason: "aggregator" },
  { re: /(^|\.)allinform\./i, reason: "aggregator" },
  { re: /(^|\.)tiu\.ru/i, reason: "aggregator" },
  { re: /(^|\.)prom\./i, reason: "aggregator" },
  { re: /(^|\.)pulscen\./i, reason: "aggregator" },
  { re: /(^|\.)youla\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)cian\.ru/i, reason: "blacklisted" },
  { re: /(^|\.)farpost\./i, reason: "blacklisted" },
];

export function getBlacklistReason(domain: string, url?: string): BlacklistReason | null {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const full = `${host}${url ? new URL(url).pathname : ""}`;
  for (const { re, reason } of BLACKLIST_PATTERNS) {
    if (re.test(host) || re.test(full)) return reason;
  }
  return null;
}

export function isBlacklistedDomain(domain: string, url?: string): boolean {
  return getBlacklistReason(domain, url) !== null;
}
