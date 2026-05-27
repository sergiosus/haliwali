import { findCityByName } from "./citiesData";
import type { SearchScopeLocation } from "./searchScopeLocation";

/** Build map browse location scope from `?city=` query param. */
export function searchScopeFromMapCityParam(cityName: string): SearchScopeLocation {
  const name = cityName.trim();
  if (!name) return { label: "Вся Россия", type: "country" };
  const city = findCityByName(name);
  if (!city) {
    return { label: name, type: "city" };
  }
  return {
    label: city.name,
    type: "city",
    lat: city.lat,
    lng: city.lng,
    region: city.region,
  };
}
