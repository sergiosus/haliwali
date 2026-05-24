import { buildSearchVariants } from "./utils/keyboardLayout";
import { isFederalRussiaSettlementName } from "./locationDisplay";

/** Row from GET /api/cities (PostgreSQL location_settlements). */
export type SettlementSearchRow = {
  id: number | null;
  name: string;
  region: string;
  lat: number;
  lng: number;
};

/** «Ижевск — Удмуртская Республика» */
export function formatSettlementPickerLine(name: string, region: string): string {
  const city = name.trim();
  const reg = region.trim();
  if (!city) return reg;
  if (isFederalRussiaSettlementName(city)) return city;
  return reg ? `${city} — ${reg}` : city;
}

export async function fetchCitiesFromApi(
  query: string,
  opts?: { regionSlug?: string; district?: string },
): Promise<SettlementSearchRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const variants = buildSearchVariants(q);
  const primary = variants[0] ?? q;
  let rows = await fetchCitiesOnce(primary, opts);
  if (rows.length === 0 && variants.length > 1) {
    rows = await fetchCitiesOnce(variants[1]!, opts);
  }
  return rows;
}

async function fetchCitiesOnce(
  query: string,
  opts?: { regionSlug?: string; district?: string },
): Promise<SettlementSearchRow[]> {
  const params = new URLSearchParams({ query });
  if (opts?.regionSlug) params.set("region", opts.regionSlug);
  if (opts?.district) params.set("district", opts.district);

  const r = await fetch(`/api/cities?${params.toString()}`, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as { ok?: unknown; cities?: unknown } | null;
  if (!j || j.ok !== true || !Array.isArray(j.cities)) return [];

  return (j.cities as unknown[])
    .map((x) => x as { id?: unknown; name?: unknown; region?: unknown; lat?: unknown; lng?: unknown })
    .map((x) => ({
      id: typeof x.id === "number" && Number.isFinite(x.id) ? x.id : null,
      name: String(x.name ?? "").trim(),
      region: String(x.region ?? "").trim(),
      lat: Number(x.lat),
      lng: Number(x.lng),
    }))
    .filter((x) => x.name && x.region && Number.isFinite(x.lat + x.lng));
}
