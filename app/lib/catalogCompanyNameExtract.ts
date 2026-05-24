import { decodeHtmlEntities, extractJsonLd, metaContent, pickOrgNode, stripTags, str } from "./catalogExtractShared";

/** Lowercase tokens that are catalog/menu headings, not company names. */
const BAD_NAME_EXACT = new Set(
  [
    "двигатели",
    "коробки передач",
    "кпп",
    "акпп",
    "запчасти",
    "каталог",
    "услуги",
    "товары",
    "главная",
    "home",
    "контакты",
    "о компании",
    "о нас",
    "новости",
    "блог",
    "цены",
    "прайс",
    "категории",
    "разделы",
    "меню",
    "корзина",
    "catalog",
    "shop",
    "products",
    "services",
    "для клиентов",
    "для покупателей",
    "для продавцов",
  ].map((s) => s.toLowerCase()),
);

const BAD_NAME_RE = [
  /^(двигател|коробк|передач|акпп|кпп|подвеск|тормоз|кузовн|электрик|фильтр|масл[ао])\b/i,
  /^(купить|продаж|цена|скидк|доставк|оплат)/i,
  /^для\s+(клиент|покупател|продавц|партнёр|партнер)/i,
  /^[\d\s\-–—|]+$/,
  /^.{0,3}$/,
];

/** Likely a person name (not a legal entity). */
const PERSON_NAME_RE =
  /^[А-ЯЁ][а-яё]{1,20}\s+[А-ЯЁ][а-яё]{1,20}(\s+[А-ЯЁ][а-яё]{1,20})?$/;

function normalizeNameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isLikelyBadCompanyName(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 120) return true;
  const key = normalizeNameKey(t);
  if (BAD_NAME_EXACT.has(key)) return true;
  if (BAD_NAME_RE.some((re) => re.test(t))) return true;
  if (/\b(для\s+клиент|для\s+покупател)/i.test(t)) return true;
  if (PERSON_NAME_RE.test(t) && !/\b(ооо|ип|зао|оао|пао|сервис|центр|групп|авто|магазин)\b/i.test(t)) {
    return true;
  }
  const words = key.split(/\s+/);
  if (words.length === 1 && words[0]!.length <= 14 && !/\d/.test(key)) {
    if (/^(ооо|ип|зао|оао|пао|ао|нпо|чп)$/i.test(t)) return false;
    if (key.endsWith("group") || key.endsWith("сервис") || key.endsWith("центр")) return false;
  }
  return false;
}

function cleanCandidate(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\s+/g, " ")
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .trim();
}

function scoreCandidate(name: string, source: string): number {
  let s = 0;
  if (/jsonld|org/i.test(source)) s += 50;
  if (/footer|copyright|legal/i.test(source)) s += 35;
  if (/contact|ооо|ип/i.test(source)) s += 30;
  if (/og_site/i.test(source)) s += 25;
  if (/og_title|title/i.test(source)) s -= 20;
  if (/\b(ооо|ип|зао|оао|пао|ао|нпо)\b/i.test(name)) s += 15;
  if (name.length >= 4 && name.length <= 80) s += 5;
  if (isLikelyBadCompanyName(name)) s -= 100;
  return s;
}

function addCandidate(
  list: { name: string; source: string; score: number }[],
  raw: string,
  source: string,
): void {
  const name = cleanCandidate(raw);
  if (!name) return;
  list.push({ name, source, score: scoreCandidate(name, source) });
}

function extractFooterCompanyName(html: string): string {
  const tail = html.slice(-25000);
  const patterns = [
    /©\s*\d{4}[^<\n]{0,80}?([А-ЯA-ZЁ][^<\n]{2,80})/i,
    /copyright\s*©?\s*\d{4}[^<\n]{0,40}?([A-Za-zА-ЯЁ][^<\n]{2,80})/i,
    /(?:ООО|ИП|ЗАО|ОАО|ПАО)\s*[«"]?([^»"<\n]{2,100})/gi,
  ];
  for (const re of patterns) {
    const m = tail.match(re);
    if (m?.[1]) return cleanCandidate(m[1].split(/[|,]/)[0] ?? "");
  }
  return "";
}

function extractContactBlockName(html: string, visible: string): string {
  const contactHtml = html.match(
    /<(?:section|div|footer)[^>]*(?:id|class)=["'][^"']*(?:contact|контакт|footer|requisites|реквизит)[^"']*["'][^>]*>([\s\S]{0,12000})<\/(?:section|div|footer)>/i,
  );
  const chunk = contactHtml?.[1] ? stripTags(contactHtml[1]) : visible.slice(0, 6000);
  const m = chunk.match(
    /(?:ООО|ИП|ЗАО|ОАО|ПАО|АО|НПО)\s*[«"]?([^»"\n,;]{2,100})/i,
  );
  if (m?.[0]) return cleanCandidate(m[0]);
  return "";
}

function extractBrandingName(html: string): string {
  const logoAlt = html.match(/<img[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*alt=["']([^"']{2,80})["']/i);
  if (logoAlt?.[1] && !isLikelyBadCompanyName(logoAlt[1])) return cleanCandidate(logoAlt[1]);
  const logoAlt2 = html.match(/alt=["']([^"']{2,80})["'][^>]*(?:class|id)=["'][^"']*logo/i);
  if (logoAlt2?.[1] && !isLikelyBadCompanyName(logoAlt2[1])) return cleanCandidate(logoAlt2[1]);
  return "";
}

export function pickCompanyNameFromHtml(
  html: string,
  opts?: { pageUrl?: string },
): { name: string; nameSource: string } {
  const jsonLd = extractJsonLd(html);
  const org = pickOrgNode(jsonLd);
  const visible = stripTags(html).replace(/\s+/g, " ");
  const ogSite = metaContent(html, "og:site_name");
  const metaOrg = metaContent(html, "organization");

  const candidates: { name: string; source: string; score: number }[] = [];

  if (org) addCandidate(candidates, str(org.name), "jsonld_org");
  addCandidate(candidates, extractFooterCompanyName(html), "footer");
  addCandidate(candidates, extractContactBlockName(html, visible), "contact");
  addCandidate(candidates, metaOrg, "meta_org");
  addCandidate(candidates, ogSite, "og_site");
  addCandidate(candidates, extractBrandingName(html), "branding");

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.find((c) => c.score > 0 && !isLikelyBadCompanyName(c.name));
  if (best) return { name: best.name.slice(0, 200), nameSource: best.source };

  const fallback = cleanCandidate(str(org?.name) || ogSite || "");
  return {
    name: isLikelyBadCompanyName(fallback) ? "" : fallback.slice(0, 200),
    nameSource: fallback ? "fallback" : "none",
  };
}
