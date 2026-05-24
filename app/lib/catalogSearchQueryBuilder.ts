/** Localized multi-query builder for catalog source discovery. */

const CATEGORY_QUERY_VARIANTS: Record<string, (base: string, city: string) => string[]> = {
  auto: (base, city) => {
    const root = base.trim() || "авторазборка";
    return [
      `${root} ${city}`,
      `авторазборки ${city}`,
      `разбор авто ${city}`,
      `б/у запчасти ${city}`,
      `контрактные запчасти ${city}`,
      `автозапчасти с разбора ${city}`,
    ];
  },
  remont: (base, city) => [
    `${base || "ремонт"} ${city}`,
    `ремонт квартир ${city}`,
    `отделка ${city}`,
    `сантехник ${city}`,
    `электрик ${city}`,
    `ремонт под ключ ${city}`,
  ],
  stroitelstvo: (base, city) => [
    `${base || "строительство"} ${city}`,
    `строительные компании ${city}`,
    `подрядчик строительство ${city}`,
    `строительство домов ${city}`,
    `генподряд ${city}`,
  ],
  perevozki: (base, city) => [
    `${base || "грузоперевозки"} ${city}`,
    `перевозка грузов ${city}`,
    `доставка грузов ${city}`,
    `грузоперевозчик ${city}`,
    `эвакуатор ${city}`,
  ],
  tekhnika: (base, city) => [
    `${base || "спецтехника"} ${city}`,
    `аренда техники ${city}`,
    `оборудование ${city}`,
    `сервис оборудования ${city}`,
  ],
  magaziny: (base, city) => [
    `${base || "магазин"} ${city}`,
    `опт ${city} ${base}`.trim(),
    `розница ${city}`,
    `поставщик ${city}`,
  ],
  drugie: (base, city) => [`${base || "компания"} ${city}`, `услуги ${city} ${base}`.trim()],
};

export function buildCatalogSearchQueries(opts: {
  query: string;
  city: string;
  categorySlug: string;
}): string[] {
  const city = opts.city.trim();
  const base = opts.query.trim();
  if (!base && !city) return [];

  const fn = CATEGORY_QUERY_VARIANTS[opts.categorySlug] ?? CATEGORY_QUERY_VARIANTS.drugie!;
  const variants = fn(base, city);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of variants) {
    const t = q.replace(/\s+/g, " ").trim();
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 6);
}

export function searchLocaleParams(): { country: string; lang: string; regionBoost: boolean } {
  return {
    country: (process.env.SEARCH_COUNTRY ?? "RU").trim().toUpperCase(),
    lang: (process.env.SEARCH_LANG ?? "ru").trim().toLowerCase(),
    regionBoost: process.env.SEARCH_REGION_BOOST !== "false",
  };
}
