import { logCatalogDiscover } from "./catalogCatalogLog";
import { buildCatalogSearchQueries, searchLocaleParams } from "./catalogSearchQueryBuilder";
import { guessSourceTypeFromDomain } from "./catalogSourceClassifier";

export type SearchProviderKind =
  | "serpapi"
  | "dataforseo"
  | "bing"
  | "brave"
  | "yandex_xml"
  | "none";

export type SearchCandidate = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  sourceTypeGuess: ReturnType<typeof guessSourceTypeFromDomain>;
};

function provider(): SearchProviderKind {
  const p = (process.env.SEARCH_PROVIDER ?? "none").toLowerCase();
  if (
    p === "serpapi" ||
    p === "dataforseo" ||
    p === "bing" ||
    p === "brave" ||
    p === "yandex_xml" ||
    p === "none"
  ) {
    return p;
  }
  return "none";
}

function maxResults(): number {
  const n = Number(process.env.SEARCH_MAX_RESULTS ?? 50);
  return Number.isFinite(n) ? Math.min(Math.max(n, 5), 50) : 50;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function toCandidate(url: string, title: string, snippet: string): SearchCandidate {
  const domain = domainFromUrl(url);
  return {
    url,
    title: title.slice(0, 300),
    snippet: snippet.slice(0, 500),
    domain,
    sourceTypeGuess: guessSourceTypeFromDomain(domain),
  };
}

function mergeCandidates(lists: SearchCandidate[]): SearchCandidate[] {
  const byUrl = new Map<string, SearchCandidate>();
  for (const c of lists) {
    const key = c.url.toLowerCase();
    const prev = byUrl.get(key);
    if (!prev || c.title.length > prev.title.length) byUrl.set(key, c);
  }
  return [...byUrl.values()];
}

function dedupeByDomain(items: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>();
  const out: SearchCandidate[] = [];
  for (const item of items) {
    const key = item.domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function searchPublicWeb(opts: {
  query: string;
  city?: string;
  categorySlug?: string;
}): Promise<{
  ok: boolean;
  candidates: SearchCandidate[];
  queriesUsed: string[];
  error?: string;
}> {
  const kind = provider();
  const key = process.env.SEARCH_API_KEY?.trim() ?? "";
  const locale = searchLocaleParams();

  const queries = buildCatalogSearchQueries({
    query: opts.query,
    city: opts.city ?? "",
    categorySlug: opts.categorySlug ?? "drugie",
  });

  if (queries.length === 0) {
    return { ok: false, candidates: [], queriesUsed: [], error: "EMPTY_QUERY" };
  }
  if (kind === "none") {
    return { ok: false, candidates: [], queriesUsed: queries, error: "SEARCH_PROVIDER_NONE" };
  }
  if (!key) {
    return { ok: false, candidates: [], queriesUsed: queries, error: "SEARCH_API_KEY_MISSING" };
  }

  const limit = maxResults();
  const perQuery = Math.max(5, Math.ceil(limit / queries.length));

  logCatalogDiscover("search_start", {
    provider: kind,
    queryCount: queries.length,
    city: opts.city?.slice(0, 40),
    category: opts.categorySlug,
  });

  try {
    const batches: SearchCandidate[] = [];
    for (const q of queries) {
      let batch: SearchCandidate[] = [];
      if (kind === "serpapi") batch = (await serpApiSearch(q, key, perQuery, locale)).candidates;
      else if (kind === "brave") batch = (await braveSearch(q, key, perQuery)).candidates;
      else if (kind === "bing") batch = (await bingSearch(q, key, perQuery)).candidates;
      else if (kind === "yandex_xml") batch = (await yandexXmlSearch(q, key, perQuery)).candidates;
      else if (kind === "dataforseo") batch = (await dataForSeoSearch(q, key, perQuery)).candidates;
      batches.push(...batch);
    }

    const merged = dedupeByDomain(mergeCandidates(batches)).slice(0, limit);
    logCatalogDiscover("search_done", { raw: batches.length, merged: merged.length });
    return { ok: true, candidates: merged, queriesUsed: queries };
  } catch {
    logCatalogDiscover("search_failed", { provider: kind });
    return { ok: false, candidates: [], queriesUsed: queries, error: "SEARCH_FAILED" };
  }
}

async function serpApiSearch(
  q: string,
  key: string,
  limit: number,
  locale: ReturnType<typeof searchLocaleParams>,
): Promise<{ candidates: SearchCandidate[] }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("api_key", key);
  url.searchParams.set("num", String(Math.min(limit, 20)));
  url.searchParams.set("hl", locale.lang);
  url.searchParams.set("gl", locale.country.toLowerCase());
  if (locale.country === "RU") url.searchParams.set("google_domain", "google.ru");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("SEARCH_HTTP_ERROR");
  const data = (await res.json()) as {
    organic_results?: { link?: string; title?: string; snippet?: string }[];
  };
  const candidates = (data.organic_results ?? [])
    .filter((r) => r.link)
    .map((r) => toCandidate(r.link!, r.title ?? "", r.snippet ?? ""));
  return { candidates };
}

async function braveSearch(q: string, key: string, limit: number): Promise<{ candidates: SearchCandidate[] }> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${Math.min(limit, 20)}`,
    {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error("SEARCH_HTTP_ERROR");
  const data = (await res.json()) as {
    web?: { results?: { url?: string; title?: string; description?: string }[] };
  };
  return {
    candidates: (data.web?.results ?? [])
      .filter((r) => r.url)
      .map((r) => toCandidate(r.url!, r.title ?? "", r.description ?? "")),
  };
}

async function bingSearch(q: string, key: string, limit: number): Promise<{ candidates: SearchCandidate[] }> {
  const res = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=${Math.min(limit, 20)}&mkt=ru-RU`,
    { headers: { "Ocp-Apim-Subscription-Key": key }, cache: "no-store" },
  );
  if (!res.ok) throw new Error("SEARCH_HTTP_ERROR");
  const data = (await res.json()) as {
    webPages?: { value?: { url?: string; name?: string; snippet?: string }[] };
  };
  return {
    candidates: (data.webPages?.value ?? [])
      .filter((r) => r.url)
      .map((r) => toCandidate(r.url!, r.name ?? "", r.snippet ?? "")),
  };
}

async function yandexXmlSearch(q: string, key: string, limit: number): Promise<{ candidates: SearchCandidate[] }> {
  const user = process.env.YANDEX_XML_USER ?? key;
  const url = `https://yandex.com/search/xml?user=${encodeURIComponent(user)}&key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&groupby=attr%3D%22%22.mode%3Dflat.groups-on-page%3D${Math.min(limit, 20)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("SEARCH_HTTP_ERROR");
  const xml = await res.text();
  const candidates: SearchCandidate[] = [];
  const docRe = /<doc>[\s\S]*?<\/doc>/gi;
  let m: RegExpExecArray | null;
  while ((m = docRe.exec(xml))) {
    const block = m[0]!;
    const link = block.match(/<url>([^<]+)<\/url>/i)?.[1];
    const title = block.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
    const snippet = block.match(/<passage>([^<]+)<\/passage>/i)?.[1] ?? "";
    if (link) candidates.push(toCandidate(link, title, snippet));
  }
  return { candidates };
}

async function dataForSeoSearch(q: string, key: string, limit: number): Promise<{ candidates: SearchCandidate[] }> {
  const login = process.env.DATAFORSEO_LOGIN?.trim() || key;
  const auth = Buffer.from(`${login}:${key}`).toString("base64");
  const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        keyword: q,
        location_code: 2643,
        language_code: "ru",
        depth: Math.min(limit, 20),
      },
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("SEARCH_HTTP_ERROR");
  const data = (await res.json()) as {
    tasks?: { result?: { items?: { url?: string; title?: string; description?: string }[] }[] }[];
  };
  const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
  return {
    candidates: items
      .filter((r) => r.url)
      .map((r) => toCandidate(r.url!, r.title ?? "", r.description ?? "")),
  };
}

export function groupCandidatesByDomain<T extends { domain: string }>(
  candidates: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const c of candidates) {
    if (!groups[c.domain]) groups[c.domain] = [];
    groups[c.domain]!.push(c);
  }
  return groups;
}
