export type SelectedLocationSource = "suggestion" | "map" | "geolocation";

/** Normalized explicit location selection (never raw typed search text alone). */
export type SelectedLocation = {
  city: string;
  /** Administrative subject; empty only when the geocoder truly provides none. */
  region: string;
  displayName: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source: SelectedLocationSource;
};

export const LOCATION_MESSAGES = {
  pickRequired: "Выберите город или область из списка",
  russiaOnly: "Пока можно размещать объявления только по России",
} as const;
