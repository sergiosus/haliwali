import type { StoredLocationPickKind } from "./useStoredCity";

/** Legacy shape for scope mapping (no external geocoder). */
export type BrowseLocationSubtypeRu =
  | "страна"
  | "федеральный округ"
  | "регион"
  | "район"
  | "город"
  | "село"
  | "деревня"
  | "посёлок"
  | "населённый пункт"
  | "точка";

export type BrowseGeoPickRow = {
  suggestionLine: string;
  pickKind: StoredLocationPickKind;
  subtypeLabel: BrowseLocationSubtypeRu;
  settlementName: string;
  regionFilterName: string;
  districtFilter: string;
  displayNameClean: string;
  lat: number;
  lng: number;
};
