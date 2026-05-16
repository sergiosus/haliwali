"use client";

import { cityNames } from "./cities";

export {
  allDirectoryItems,
  categoryTitleFromSlug,
  directoryColumns,
  getDirectoryItemBySlug,
  homeCategoryGridSections,
  normalizeQuery,
  type DirectoryItem,
  type DirectoryTab,
} from "./categoryDirectory";

/** Major Russian cities for combobox presets; duplicates removed; locale-sorted */
export const russianCities = (() => {
  const raw = [...cityNames, "Другое"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b, "ru"));
})() as readonly string[];

export { slugify } from "./slugify";
