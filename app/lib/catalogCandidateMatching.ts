import type { RankedSearchCandidate } from "./catalogDiscoverRanking";
import type { CatalogCandidateMatchStatus, PersistedImportCandidate } from "./catalogImportCandidateTypes";
import { normalizeImportDomain } from "./catalogImportDomain";
import type { CatalogCompanyAdminItem } from "./catalogTypes";

type ExistingCompanyMatch = NonNullable<PersistedImportCandidate["existingCompany"]>;

type MatchResult = {
  catalogMatchStatus: CatalogCandidateMatchStatus;
  existingCompany: ExistingCompanyMatch | null;
  catalogMatchReason: string | null;
};

const LEGAL_FORM_RE =
  /\b(ооо|оао|ао|зао|ип|нко|пк|тоо|llc|ltd|inc|company|компания|фирма|сервис|центр)\b/gi;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/https?:\/\/|www\./g, " ")
    .replace(LEGAL_FORM_RE, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalizeText(raw);
  }
}

function safeDomain(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return normalizeImportDomain(raw);
  } catch {
    return "";
  }
}

function cityMatches(company: CatalogCompanyAdminItem, city: string): boolean {
  const target = normalizeText(city);
  if (!target) return false;
  return [company.city, ...company.serviceCities].some((item) => normalizeText(item) === target);
}

function nameSimilarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if ((left.length >= 6 && right.includes(left)) || (right.length >= 6 && left.includes(right))) return 0.92;

  const leftTokens = new Set(left.split(" ").filter((x) => x.length >= 3));
  const rightTokens = new Set(right.split(" ").filter((x) => x.length >= 3));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let common = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) common += 1;
  }
  return common / Math.max(leftTokens.size, rightTokens.size);
}

function phonesFromText(value: string): string[] {
  const matches = value.match(/(?:\+?\d[\s().-]*){7,}\d/g) ?? [];
  return matches.map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 10);
}

function emailsFromText(value: string): string[] {
  return (value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((x) => x.toLowerCase());
}

function candidateContacts(candidate: RankedSearchCandidate): { phones: Set<string>; emails: Set<string> } {
  const blob = `${candidate.title} ${candidate.snippet} ${candidate.url}`;
  return {
    phones: new Set(phonesFromText(blob)),
    emails: new Set(emailsFromText(blob)),
  };
}

function companyContacts(company: CatalogCompanyAdminItem): { phones: Set<string>; emails: Set<string> } {
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const contact of company.contacts ?? []) {
    if (contact.type === "phone") {
      for (const phone of phonesFromText(contact.value)) phones.add(phone);
    } else if (contact.type === "email") {
      for (const email of emailsFromText(contact.value)) emails.add(email);
    }
  }
  return { phones, emails };
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function existingCompany(company: CatalogCompanyAdminItem): ExistingCompanyMatch {
  return {
    id: company.id,
    name: company.name,
    categorySlug: company.categorySlug,
    categoryTitle: company.categoryTitle,
    city: company.city,
    slug: company.slug,
    href: `/catalogs/${encodeURIComponent(company.categorySlug)}/${encodeURIComponent(company.slug)}`,
    website: company.website,
  };
}

function bestMatch(candidate: RankedSearchCandidate, companies: CatalogCompanyAdminItem[], city: string, categorySlug: string): MatchResult {
  const candidateUrl = normalizeUrl(candidate.url);
  const candidateDomain = safeDomain(candidate.url || candidate.domain);
  const candidateName = candidate.title;
  const contacts = candidateContacts(candidate);
  let possible: { company: CatalogCompanyAdminItem; reason: string; score: number } | null = null;

  for (const company of companies) {
    const sameCategory = company.categorySlug === categorySlug;
    const sameCity = cityMatches(company, city);
    const companyUrl = normalizeUrl(company.website);
    const companyDomain = safeDomain(company.website);
    const sameUrl = Boolean(candidateUrl && companyUrl && candidateUrl === companyUrl);
    const sameDomain = Boolean(candidateDomain && companyDomain && candidateDomain === companyDomain);
    const similarName = nameSimilarity(candidateName, company.name);
    const companyContactSet = companyContacts(company);
    const samePhoneOrEmail =
      setsIntersect(contacts.phones, companyContactSet.phones) ||
      setsIntersect(contacts.emails, companyContactSet.emails);

    if (sameUrl) {
      return {
        catalogMatchStatus: "already_published",
        existingCompany: existingCompany(company),
        catalogMatchReason: "same_source_url",
      };
    }
    if (sameDomain && sameCategory && sameCity) {
      return {
        catalogMatchStatus: "already_published",
        existingCompany: existingCompany(company),
        catalogMatchReason: "same_domain_category_city",
      };
    }
    if (similarName >= 0.82 && sameCity && sameCategory) {
      return {
        catalogMatchStatus: "already_published",
        existingCompany: existingCompany(company),
        catalogMatchReason: "similar_name_city_category",
      };
    }

    let possibleScore = 0;
    let possibleReason = "";
    if (sameDomain) {
      possibleScore = 90;
      possibleReason = "same_domain_unclear_city_or_category";
    } else if (samePhoneOrEmail) {
      possibleScore = 88;
      possibleReason = "same_phone_or_email";
    } else if (similarName >= 0.58) {
      possibleScore = Math.round(similarName * 100);
      possibleReason = "similar_name_unclear_city_or_category";
    }
    if (possibleScore > (possible?.score ?? 0)) {
      possible = { company, reason: possibleReason, score: possibleScore };
    }
  }

  if (possible) {
    return {
      catalogMatchStatus: "possible_duplicate",
      existingCompany: existingCompany(possible.company),
      catalogMatchReason: possible.reason,
    };
  }

  return {
    catalogMatchStatus: "new_candidate",
    existingCompany: null,
    catalogMatchReason: null,
  };
}

export function attachCatalogCandidateMatches<T extends RankedSearchCandidate>(
  candidates: T[],
  companies: CatalogCompanyAdminItem[],
  opts: { city: string; categorySlug: string },
): (T & Omit<MatchResult, never>)[] {
  return candidates.map((candidate) => ({
    ...candidate,
    ...bestMatch(candidate, companies, opts.city, opts.categorySlug),
  }));
}

