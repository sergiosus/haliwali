import { categoryToSlug, homeParentSlugForLeafSlug, isHomeParentCategorySlug } from "./categories";
import type { Listing } from "./listingModel";

type ListingKind = "task" | "service" | "product_sell" | "product_buy";

function listingKind(type: string): ListingKind {
  if (type === "service") return "service";
  if (type === "product_sell" || type === "product_buy") return "product_sell";
  return "task";
}

/** Old stored category titles → new canonical titles (exact user taxonomy). */
const LEGACY_TASK_NAME: Record<string, string> = {
  Доставка: "доставка",
  "Курьерские поручения": "курьер",
  "Компьютерная помощь": "настройка ПК",
  "Нужен мастер": "поиск исполнителя",
  "Ремонт техники": "ремонт техники",
  "Ремонт и строительство": "сантехника",
  Перевозки: "переезд",
  "Помощь по дому": "помощь по дому",
  Уборка: "уборка",
  "Разовые задания": "разовые поручения",
  "Срочно сегодня": "разовые поручения",
  "Удалённые задачи": "разовые поручения",
  "Организация мероприятий": "Другое",
  "Фото и видео задачи": "Другое",
  "Подработка и смены": "подработка и работа",
  "Мероприятия и организация": "Другое",
  "Офис и документы": "Другое",
  "Помощь с авто": "найти авто",
  Другое: "Другое",
};

const LEGACY_SERVICE_NAME: Record<string, string> = {
  Автоуслуги: "автоуслуги",
  Бухгалтерия: "бухгалтерия",
  "Компьютеры и техника": "компьютеры",
  Уборка: "уборка",
  "Перевозки и доставка": "доставка",
  Перевозки: "доставка",
  "Красота и здоровье": "парикмахер",
  "Юридические услуги": "юруслуги",
  "Недвижимость услуги": "аренда недвижимости",
  "Недвижимость и аренда": "аренда недвижимости",
  Обучение: "репетиторы",
  "Реклама и дизайн": "сайты",
  "Фото и видео": "фото",
  "Ремонт бытовой техники": "ремонт техники",
  "Ремонт и строительство": "ремонт квартир",
  Репетиторы: "репетиторы",
  "Ремонт и бытовые услуги": "ремонт квартир",
  "Строительство и ремонт": "ремонт квартир",
  Ремонт: "ремонт квартир",
  "Компьютеры и электроника": "компьютеры",
  Компьютеры: "компьютеры",
  "Авто услуги": "автоуслуги",
  Авто: "автоуслуги",
  "Риелторы и жильё": "сдаю жильё",
  "Коммерческая аренда": "коммерческая аренда",
  Другое: "Другое",
};

const LEGACY_PRODUCT_NAME: Record<string, string> = {
  Автотовары: "запчасти",
  Бесплатно: "Другое",
  "Телефоны и гаджеты": "телефоны",
  Электроника: "техника",
  "Ноутбуки и компьютеры": "компьютеры",
  "Бытовая техника": "техника",
  Комплектующие: "запчасти",
  Инструменты: "инструменты",
  "Мебель и дом": "мебель",
  "Одежда и обувь": "одежда",
  Животные: "животные",
  "Спорт и отдых": "спорт",
  "Детские товары": "детские товары",
  Запчасти: "запчасти",
  "Шины и диски": "шины",
  "Автозапчасти и шины": "шины",
  "Квартиры и дома": "квартиры",
  Авто: "автомобили",
  Другое: "Другое",
};

/** Old category URL slugs → new canonical slugs (for counts + canonical browse). */
export const LEGACY_SLUG_TO_CANONICAL: Record<string, string> = {
  // tasks
  dostavka: "zadachi-dostavka",
  "zadachi-kurerskie-porucheniya": "zadachi-kurer",
  "zadachi-kompyuternaya-pomoshch": "zadachi-nastroyka-pk",
  "nuzhen-master": "zadachi-poisk-ispolnitelya",
  "zadachi-remont-tehniki": "zadachi-remont-tehniki",
  "zadachi-remont-i-stroitelstvo": "zadachi-santehnika",
  "zadachi-perevozki": "zadachi-pereezd",
  "pomosh-po-domu": "zadachi-pomosh-po-domu",
  "zadachi-uborka": "zadachi-uborka",
  "razovye-zadaniya": "zadachi-razovye-porucheniya",
  "srochno-segodnya": "zadachi-razovye-porucheniya",
  "udalennye-zadachi": "zadachi-razovye-porucheniya",
  "zadachi-organizatsiya-meropriyatiy": "zadachi-drugoe",
  "zadachi-foto-i-video": "zadachi-drugoe",
  "podrabotka-i-smeny": "zadachi-podrabotka-i-rabota",
  "meropriyatiya-i-organizatsiya": "zadachi-drugoe",
  "ofis-i-dokumenty": "zadachi-drugoe",
  "pomoshch-s-avto": "zadachi-nayti-avto",
  "zadachi-drugoe": "zadachi-drugoe",
  // services
  "avto-uslugi": "uslugi-avtouslugi",
  buhgalteriya: "uslugi-buhgalteriya",
  "kompyutery-i-tehnika": "uslugi-kompyutery",
  uborka: "uslugi-uborka",
  "krasota-i-zdorove": "uslugi-parikmacher",
  "perevozki-i-dostavka": "uslugi-dostavka",
  "yuridicheskie-uslugi": "uslugi-yuruslugi",
  "rieltory-i-zhile": "uslugi-arenda-nedvizhimosti",
  obuchenie: "uslugi-repetitory",
  "reklama-i-dizayn": "uslugi-sayty",
  "foto-i-video": "uslugi-foto",
  "remont-bytovoy-tehniki": "uslugi-remont-tehniki",
  "remont-i-stroitelstvo": "uslugi-remont-kvartir",
  repetitory: "uslugi-repetitory",
  "uslugi-drugoe": "uslugi-drugoe",
  // products
  "telefony-i-gadzhety": "tovary-telefony",
  "bytovaya-tehnika": "tovary-tehnika",
  "mebel-i-dom": "tovary-mebel",
  "odezhda-i-obuv": "tovary-odezhda",
  avto: "tovary-avtomobili",
  zhivotnye: "tovary-zhivotnye",
  besplatno: "tovary-drugoe",
  "kvartiry-i-doma": "tovary-kvartiry",
  "sport-i-otdyh": "tovary-sport",
  "detskie-tovary": "tovary-detskie-tovary",
  "avtozapchasti-i-shiny": "tovary-shiny",
  elektronika: "tovary-tehnika",
  "noutbuki-i-kompyutery": "tovary-kompyutery",
  komplektuyushchie: "tovary-zapchasti",
  avtotovary: "tovary-zapchasti",
  zapchasti: "tovary-zapchasti",
  "shiny-i-diski": "tovary-shiny",
  instrumenty: "tovary-instrumenty",
  "tovary-drugoe": "tovary-drugoe",
};

export function normalizeLegacyCategoryName(categoryName: string, type: string): string {
  const raw = (categoryName ?? "").trim();
  if (!raw) return "";
  const kind = listingKind(type);
  if (kind === "task") return LEGACY_TASK_NAME[raw] ?? raw;
  if (kind === "service") return LEGACY_SERVICE_NAME[raw] ?? raw;
  return LEGACY_PRODUCT_NAME[raw] ?? raw;
}

/** Leaf slug after legacy normalization (for subcategory pages and mapping). */
export function canonicalCategorySlugForListing(
  listing: Pick<Listing, "categorySlug" | "categoryName" | "type">,
): string {
  const stored = (listing.categorySlug ?? "").trim();
  if (stored) {
    const mapped = LEGACY_SLUG_TO_CANONICAL[stored];
    if (mapped) return mapped;
    return stored;
  }
  const name = normalizeLegacyCategoryName(listing.categoryName ?? "", listing.type);
  if (!name) return "";
  return categoryToSlug(name, listingKind(listing.type));
}

/** Homepage parent slug used for counts and parent category browse. */
export function homeParentSlugForListing(
  listing: Pick<Listing, "categorySlug" | "categoryName" | "type">,
): string {
  const leaf = canonicalCategorySlugForListing(listing);
  if (!leaf) return "";
  return homeParentSlugForLeafSlug(leaf) ?? leaf;
}

export function listingMatchesDirectoryCategorySlug(
  listing: Pick<Listing, "categorySlug" | "categoryName" | "type">,
  slug: string,
): boolean {
  const target = (slug ?? "").trim();
  if (!target) return false;

  if (isHomeParentCategorySlug(target)) {
    return homeParentSlugForListing(listing) === target;
  }

  const stored = (listing.categorySlug ?? "").trim();
  if (stored === target) return true;
  const canonical = canonicalCategorySlugForListing(listing);
  const targetCanonical = LEGACY_SLUG_TO_CANONICAL[target] ?? target;
  return canonical === targetCanonical;
}
