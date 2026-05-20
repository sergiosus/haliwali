import type { GlobalSearchListingTypeFilter } from "./globalSearchTypes";

/** Outbound search URLs only — no scraping, no server calls to third parties. */
export type ExternalMarketplaceSearchLink = {
  label: string;
  href: string;
};

function yandexSearch(text: string): string {
  return `https://yandex.ru/search/?text=${encodeURIComponent(text)}`;
}

function googleSearch(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Public Avito listing search (query in `q`). */
function avitoSearchUrl(q: string): string {
  return `https://www.avito.ru/all?q=${encodeURIComponent(q)}`;
}

function yandexSiteSearch(site: string, q: string): string {
  return yandexSearch(`site:${site} ${q}`.trim());
}

const SERVICE_QUERY_HINT =
  /ремонт|сантехник|электрик|уборк|установк|укладк|покрас|отделк|натяжн|сборк|монтаж|демонтаж|услуг|плиточник|штукатур|отоплен|кондицион|окон|пвх|сварк|стяжк|шпаклев|гипсокартон|плинтус|ламинат|паркет/i;

const AUTO_QUERY_HINT =
  /авто|машин|автомоб|запчаст|шин|диск|колес|аккумулятор|мотор|дром|мото|прицеп|фаркоп|масло\s+мотор|тормоз|фильтр\s+воздуш|акпп|мкпп|bmw|toyota|lada|ваз|газель|skoda|kia|hyundai|nissan/i;

function looksServiceRelated(q: string, type: GlobalSearchListingTypeFilter): boolean {
  if (type === "service") return true;
  const t = q.trim();
  if (t.length < 2) return false;
  return SERVICE_QUERY_HINT.test(t);
}

function looksAutoRelated(q: string): boolean {
  const t = q.trim();
  if (t.length < 2) return false;
  return AUTO_QUERY_HINT.test(t);
}

/**
 * Safe outbound links for “search elsewhere” — URLs only, client-side.
 * @param q trimmed search query
 * @param type active listing type tab (helps Профи / service hint)
 */
export function getExternalMarketplaceSearchLinks(
  q: string,
  type: GlobalSearchListingTypeFilter,
): ExternalMarketplaceSearchLink[] {
  const query = q.trim();
  if (query.length < 1) return [];

  const out: ExternalMarketplaceSearchLink[] = [];

  out.push({
    label: "Яндекс",
    href: yandexSearch(`${query} объявления`),
  });
  out.push({ label: "Google", href: googleSearch(query) });
  out.push({ label: "Авито", href: avitoSearchUrl(query) });
  out.push({
    label: "Юла",
    href: yandexSiteSearch("youla.ru", query),
  });

  if (looksServiceRelated(query, type)) {
    out.push({
      label: "Профи",
      href: yandexSiteSearch("profi.ru", query),
    });
  }

  if (looksAutoRelated(query)) {
    out.push({
      label: "Дром",
      href: yandexSiteSearch("drom.ru", query),
    });
  }

  return out;
}
