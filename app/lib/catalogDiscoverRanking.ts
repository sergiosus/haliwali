import { isBlacklistedDomain, getBlacklistReason } from "./catalogDiscoverBlacklist";
import { detectDiscoverySourceType, type DiscoverySourceType } from "./catalogDiscoverSourceType";
import { slugifyCatalogText } from "./catalogSlug";
import type { SearchCandidate } from "./catalogSearchProvider";

const MARKETPLACE_AGGREGATOR_TYPES: DiscoverySourceType[] = ["aggregator", "listing"];

/** Major cities → latin slug hints for URL matching */
const CITY_SLUG_HINTS: Record<string, string[]> = {
  ижевск: ["izhevsk", "izh"],
  москва: ["moscow", "msk", "moskva"],
  "санкт-петербург": ["spb", "petersburg", "sankt-peterburg"],
  казань: ["kazan"],
  уфа: ["ufa"],
  пермь: ["perm"],
  екатеринбург: ["ekaterinburg", "ekb", "yekaterinburg"],
  новосибирск: ["novosibirsk"],
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function cityTokens(city: string): string[] {
  const c = norm(city);
  if (!c) return [];
  const tokens = [c, slugifyCatalogText(c)];
  const hints = CITY_SLUG_HINTS[c] ?? [];
  return [...new Set([...tokens, ...hints].filter(Boolean))];
}

function textHasCity(text: string, city: string): boolean {
  const t = norm(text);
  if (!city.trim()) return false;
  if (t.includes(norm(city))) return true;
  return cityTokens(city).some((tok) => tok.length >= 3 && t.includes(tok));
}

function urlHasCity(url: string, domain: string, city: string): boolean {
  const blob = `${domain} ${url}`.toLowerCase();
  return cityTokens(city).some((tok) => tok.length >= 3 && blob.includes(tok));
}

/** Rough “another city” hints when target city is set */
const OTHER_CITY_MARKERS = [
  "москва",
  "москве",
  "спб",
  "петербург",
  "казань",
  "новосибирск",
  "екатеринбург",
  "краснодар",
  "ростов",
  "самара",
  "воронеж",
  "ижевск",
  "уфа",
  "пермь",
];

function snippetSuggestsOtherCity(snippet: string, title: string, targetCity: string): boolean {
  if (!targetCity.trim()) return false;
  const blob = `${title} ${snippet}`.toLowerCase();
  const target = norm(targetCity);
  for (const marker of OTHER_CITY_MARKERS) {
    if (marker === target || target.includes(marker) || marker.includes(target)) continue;
    if (blob.includes(marker)) return true;
  }
  return false;
}

export type RankedSearchCandidate = SearchCandidate & {
  relevanceScore: number;
  discoverySourceType: DiscoverySourceType;
  hidden: boolean;
  hideReason: string | null;
};

export function scoreSearchCandidate(
  c: SearchCandidate,
  opts: {
    city: string;
    categoryKeywords: string[];
    regionBoost: boolean;
  },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const blob = `${c.title} ${c.snippet}`.toLowerCase();
  const domain = c.domain.toLowerCase();

  if (textHasCity(blob, opts.city)) {
    score += 30;
    reasons.push("city:text");
  }
  if (urlHasCity(c.url, domain, opts.city)) {
    score += 20;
    reasons.push("city:url");
  }

  for (const kw of opts.categoryKeywords) {
    if (kw.length >= 3 && blob.includes(kw)) {
      score += 15;
      reasons.push("category");
      break;
    }
  }

  if (domain.endsWith(".ru")) {
    score += 10;
    reasons.push("tld:ru");
  }

  if (opts.regionBoost && opts.city && snippetSuggestsOtherCity(c.snippet, c.title, opts.city)) {
    score -= 40;
    reasons.push("other-city");
  }

  const srcType = detectDiscoverySourceType(domain, c.url, c.title);
  if (MARKETPLACE_AGGREGATOR_TYPES.includes(srcType)) {
    score -= 50;
    reasons.push("aggregator");
  }

  const bl = getBlacklistReason(domain, c.url);
  if (bl) {
    score -= 100;
    reasons.push("blacklist");
  }

  return { score, reasons };
}

export function rankAndFilterCandidates(
  raw: SearchCandidate[],
  opts: {
    city: string;
    categorySlug: string;
    query: string;
    regionBoost: boolean;
  },
): { visible: RankedSearchCandidate[]; hidden: RankedSearchCandidate[] } {
  const categoryKeywords = [
    opts.query.toLowerCase(),
    ...opts.query.split(/\s+/).filter((w) => w.length >= 4),
    opts.categorySlug.replace(/_/g, " "),
  ].filter(Boolean);

  const ranked: RankedSearchCandidate[] = raw.map((c) => {
    const { score } = scoreSearchCandidate(c, {
      city: opts.city,
      categoryKeywords,
      regionBoost: opts.regionBoost,
    });
    const discoverySourceType = detectDiscoverySourceType(c.domain, c.url, c.title);
    const blacklisted = isBlacklistedDomain(c.domain, c.url);
    const hidden = blacklisted || score <= -80;
    return {
      ...c,
      relevanceScore: score,
      discoverySourceType,
      sourceTypeGuess: c.sourceTypeGuess,
      hidden,
      hideReason: blacklisted ? "blacklisted" : score <= -80 ? "low_score" : null,
    };
  });

  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const visible = ranked.filter((c) => !c.hidden);
  const hidden = ranked.filter((c) => c.hidden);
  return { visible, hidden };
}
