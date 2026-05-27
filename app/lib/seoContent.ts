import type { DirectoryItem } from "./categoryDirectory";
import { truncateMetaDescription } from "./seo";
import type { SeoSegment } from "./seoRoutes";
import { seoUrlSlugFromDirectorySlug } from "./seoRoutes";

function segmentRuPlural(segment: SeoSegment): string {
  if (segment === "uslugi") return "услуги";
  if (segment === "zadachi") return "задачи";
  return "товары";
}

function segmentRuSingular(segment: SeoSegment): string {
  if (segment === "uslugi") return "услуга";
  if (segment === "zadachi") return "задача";
  return "товар";
}

export function seoCategoryPageTitle(item: DirectoryItem, segment: SeoSegment, cityName?: string | null): string {
  const title = item.title.trim();
  if (cityName) {
    return `${title} в ${cityName} — ${segmentRuPlural(segment)} и объявления | Haliwali`;
  }
  return `${title} — ${segmentRuPlural(segment)} и объявления | Haliwali`;
}

export function seoCategoryPageDescription(
  item: DirectoryItem,
  segment: SeoSegment,
  cityName?: string | null,
): string {
  const title = item.title.trim().toLowerCase();
  const where = cityName ? ` в ${cityName}` : "";
  const kind = segmentRuPlural(segment);
  return truncateMetaDescription(
    `Найдите ${title}, свежие объявления и компании по теме «${item.title}»${where} на Haliwali. ${kind.charAt(0).toUpperCase()}${kind.slice(1)} рядом с вами.`,
  );
}

export function seoCityLandingTitle(cityName: string): string {
  return `Услуги, товары и компании ${cityName} | Haliwali`;
}

export function seoCityLandingDescription(cityName: string): string {
  return truncateMetaDescription(
    `Объявления, услуги, задачи и компании в ${cityName}. Ищите исполнителей, товары и организации на карте и в каталоге Haliwali.`,
  );
}

/** Short SSR intro — natural, no keyword stuffing. */
export function seoCategoryIntroText(
  item: DirectoryItem,
  segment: SeoSegment,
  cityName?: string | null,
): string {
  const title = item.title.trim();
  const where = cityName ? ` в ${cityName}` : "";
  const kind = segmentRuPlural(segment);
  if (cityName) {
    return `На Haliwali вы можете найти объявления и ${kind} по теме «${title}»${where}. Смотрите актуальные предложения и компании поблизости.`;
  }
  return `Каталог объявлений и ${kind} по теме «${title}» на Haliwali. Выберите подходящее предложение или компанию в вашем городе.`;
}

export function seoCityIntroText(cityName: string): string {
  return `Объявления, ${segmentRuPlural("uslugi")}, ${segmentRuPlural("zadachi")} и ${segmentRuPlural("tovary")} в ${cityName}. Используйте категории ниже или откройте карту, чтобы искать рядом с вами.`;
}

export function seoCategoryUrlSlug(item: DirectoryItem, segment: SeoSegment): string {
  return seoUrlSlugFromDirectorySlug(item.slug, segment);
}

export function seoCategorySegmentLabel(segment: SeoSegment): string {
  return segmentRuPlural(segment);
}

export function seoCategorySegmentSingular(segment: SeoSegment): string {
  return segmentRuSingular(segment);
}
