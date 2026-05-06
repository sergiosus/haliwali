import type { SelectedLocation } from "./selectedLocation";
import { filterGlobalRussiaCitiesByQuery, findExactStaticRussiaCityMatch } from "./staticRussiaCities";

/** Resolve a city name using only local static lists (no geocoder, no coordinates required at runtime). */
export async function resolveRussiaCityFromName(cityName: string): Promise<SelectedLocation | null> {
  const q = cityName.trim();
  if (!q) return null;
  await Promise.resolve();
  const exact =
    findExactStaticRussiaCityMatch(q) ??
    filterGlobalRussiaCitiesByQuery(q).find((c) => c.city.toLowerCase() === q.toLowerCase()) ??
    null;
  const row = exact ?? filterGlobalRussiaCitiesByQuery(q)[0];
  if (!row) return null;
  return {
    city: row.city,
    region: row.region.trim(),
    displayName: row.displayName,
    address: row.displayName,
    source: "suggestion",
  };
}
