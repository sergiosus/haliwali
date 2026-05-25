export type NormalizedCatalogCompanyCities = {
  primaryCity: string;
  serviceCities: string[];
};

const CITY_SPLIT_RE = /(?:\r?\n|[,;•·]+|\s+[–—-]\s+|\.\s+)/g;

function cleanCityToken(raw: string): string {
  return raw
    .replace(/\b(?:работает|доставка|выезд|также|города|город|г)\.?\b/gi, " ")
    .replace(/^[\s:()[\]{}"“”«»'`]+|[\s:()[\]{}"“”«»'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cityKey(city: string): string {
  return city.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function splitCatalogCityList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(CITY_SPLIT_RE)
    .map(cleanCityToken)
    .filter((city) => city.length >= 2 && city.length <= 80)
    .filter((city) => !/^\d+$/.test(city));
}

export function dedupeCatalogCities(cities: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of cities) {
    const city = cleanCityToken(raw);
    const key = cityKey(city);
    if (!city || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

export function normalizeCatalogCompanyCities(
  city: string,
  serviceCities: readonly string[] = [],
  preferredPrimaryCity = "",
): NormalizedCatalogCompanyCities {
  const cityParts = splitCatalogCityList(city);
  const preferred = cleanCityToken(preferredPrimaryCity);
  const primaryCity = preferred || cityParts[0] || cleanCityToken(city);
  const primaryKey = cityKey(primaryCity);
  const service = dedupeCatalogCities([
    ...cityParts.slice(primaryCity ? 1 : 0),
    ...serviceCities.flatMap(splitCatalogCityList),
  ]).filter((c) => cityKey(c) !== primaryKey);

  return { primaryCity, serviceCities: service };
}

export function catalogCityMatches(city: string, query: string): boolean {
  const c = cityKey(city);
  const q = cityKey(query);
  return Boolean(c && q && (c === q || c.includes(q) || q.includes(c)));
}

export function matchedServiceCity(
  primaryCity: string,
  serviceCities: readonly string[],
  query: string,
): string | null {
  if (!query.trim() || catalogCityMatches(primaryCity, query)) return null;
  return serviceCities.find((city) => catalogCityMatches(city, query)) ?? null;
}

export function formatCoverageText(serviceCities: readonly string[], max = 3): string {
  const cities = dedupeCatalogCities(serviceCities);
  if (cities.length === 0) return "";
  const visible = cities.slice(0, max);
  const rest = cities.length - visible.length;
  return `Работает также: ${visible.join(", ")}${rest > 0 ? ` и ещё ${rest}` : ""}`;
}
