import type { SeoSegment } from "./seoRoutes";
import { resolveDirectoryItemForSeoUrl, seoCategoryPath } from "./seoRoutes";

export type OftenSearchedLink = {
  label: string;
  href: string;
};

/** Curated quick links — must resolve to real category pages. */
const RAW: { label: string; segment: SeoSegment; urlSlug: string }[] = [
  { label: "грузчики", segment: "zadachi", urlSlug: "gruzchiki" },
  { label: "межгород", segment: "uslugi", urlSlug: "gruzoperevozki" },
  { label: "ремонт ноутбуков", segment: "uslugi", urlSlug: "remont-tehniki" },
  { label: "авторазбор", segment: "tovary", urlSlug: "avtotovary" },
  { label: "курьер", segment: "zadachi", urlSlug: "kurer" },
];

export function getOftenSearchedLinks(): OftenSearchedLink[] {
  const out: OftenSearchedLink[] = [];
  for (const row of RAW) {
    const item = resolveDirectoryItemForSeoUrl(row.segment, row.urlSlug);
    if (!item) continue;
    out.push({
      label: row.label,
      href: seoCategoryPath(row.segment, row.urlSlug),
    });
  }
  return out;
}
