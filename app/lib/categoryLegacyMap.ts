import { categoryToSlug, homeParentSlugForLeafSlug, isHomeParentCategorySlug } from "./categories";
import type { Listing } from "./listingModel";

type ListingKind = "task" | "service" | "product_sell" | "product_buy";

function listingKind(type: string): ListingKind {
  if (type === "service") return "service";
  if (type === "product_sell" || type === "product_buy") return "product_sell";
  return "task";
}

/** Old stored category titles → new canonical titles. */
const LEGACY_TASK_NAME: Record<string, string> = {
  Доставка: "доставка",
  "Курьерские поручения": "курьер",
  "Компьютерная помощь": "настроить ПК",
  "Нужен мастер": "поиск исполнителя",
  "Ремонт техники": "починить технику",
  "Ремонт и строительство": "сантехника",
  Перевозки: "переезд",
  "Помощь по дому": "мелкий ремонт",
  Уборка: "уборка",
  "сборка мебели": "собрать мебель",
  "настройка ПК": "настроить ПК",
  "ремонт техники": "починить технику",
  "подработка и работа": "подработка",
  "разовые поручения": "разнорабочий",
  "Разовые задания": "разнорабочий",
  "Срочно сегодня": "разнорабочий",
  "Удалённые задачи": "разнорабочий",
  "Организация мероприятий": "помощь на мероприятиях",
  "Фото и видео задачи": "Другое",
  "Подработка и смены": "подработка",
  "Мероприятия и организация": "помощь на мероприятиях",
  "Офис и документы": "Другое",
  "Помощь с авто": "найти авто",
  "Перевозки и доставка": "доставка",
  "Компьютеры и техника": "настроить ПК",
  "Аренда и поиск": "поиск аренды",
  Другое: "Другое",
};

const LEGACY_SERVICE_NAME: Record<string, string> = {
  Автоуслуги: "автосервис",
  Бухгалтерия: "бухгалтерия",
  "Компьютеры и техника": "компьютеры",
  Уборка: "уборка",
  "Перевозки и доставка": "доставка",
  Перевозки: "доставка",
  "Красота и здоровье": "парикмахер",
  "Юридические услуги": "юрист",
  юруслуги: "юрист",
  "Недвижимость услуги": "аренда жилья",
  "Недвижимость и аренда": "аренда жилья",
  "аренда недвижимости": "аренда жилья",
  "сдаю жильё": "аренда жилья",
  "коммерческая аренда": "коммерческая недвижимость",
  "бизнес-услуги": "маркетинг",
  прокат: "Другое",
  Обучение: "репетиторы",
  "Реклама и дизайн": "дизайн",
  "Фото и видео": "фото",
  "Ремонт бытовой техники": "ремонт техники",
  "Ремонт и строительство": "ремонт квартир",
  Репетиторы: "репетиторы",
  "Ремонт и бытовые услуги": "ремонт квартир",
  "Строительство и ремонт": "ремонт квартир",
  Ремонт: "ремонт квартир",
  "Компьютеры и электроника": "компьютеры",
  Компьютеры: "компьютеры",
  "Авто услуги": "автосервис",
  Авто: "автосервис",
  "Риелторы и жильё": "риелтор",
  "Перевозки и авто": "доставка",
  "Бизнес и аренда": "бухгалтерия",
  автоуслуги: "автосервис",
  Другое: "Другое",
};

const LEGACY_PRODUCT_NAME: Record<string, string> = {
  Автотовары: "запчасти",
  Бесплатно: "Другое",
  "Телефоны и гаджеты": "телефоны",
  Электроника: "техника",
  "Ноутбуки и компьютеры": "ноутбуки",
  "Бытовая техника": "техника",
  Комплектующие: "запчасти",
  Инструменты: "инструменты",
  "Мебель и дом": "мебель",
  "Одежда и обувь": "одежда",
  "Одежда и дети": "одежда",
  Животные: "товары для животных",
  "Спорт и отдых": "спорт",
  "детские товары": "детская одежда",
  "Детские товары": "игрушки",
  Запчасти: "запчасти",
  "Шины и диски": "шины",
  "Автозапчасти и шины": "шины",
  "Квартиры и дома": "квартиры",
  коммерческая: "квартиры",
  Авто: "автомобили",
  "Авто и запчасти": "автомобили",
  "Хобби и животные": "спорт",
  отдых: "туризм",
  Другое: "Другое",
};

/** Old category URL slugs → new canonical slugs. */
export const LEGACY_SLUG_TO_CANONICAL: Record<string, string> = {
  // tasks — leaves
  dostavka: "zadachi-dostavka",
  "zadachi-kurerskie-porucheniya": "zadachi-kurer",
  "zadachi-kompyuternaya-pomoshch": "zadachi-nastroit-pk",
  "zadachi-nastroyka-pk": "zadachi-nastroit-pk",
  "nuzhen-master": "zadachi-poisk-ispolnitelya",
  "zadachi-remont-tehniki": "zadachi-pochinit-tehniku",
  "zadachi-remont-i-stroitelstvo": "zadachi-santehnika",
  "zadachi-perevozki": "zadachi-pereezd",
  "zadachi-sborka-mebeli": "zadachi-sobrat-mebel",
  "pomosh-po-domu": "zadachi-melkiy-remont",
  "zadachi-pomosh-po-domu": "zadachi-melkiy-remont",
  "zadachi-uborka": "zadachi-uborka",
  "razovye-zadaniya": "zadachi-raznorabochiy",
  "zadachi-razovye-porucheniya": "zadachi-raznorabochiy",
  "srochno-segodnya": "zadachi-raznorabochiy",
  "udalennye-zadachi": "zadachi-raznorabochiy",
  "zadachi-organizatsiya-meropriyatiy": "zadachi-pomosh-na-meropriyatiyah",
  "zadachi-foto-i-video": "zadachi-drugoe",
  "podrabotka-i-smeny": "zadachi-podrabotka",
  "zadachi-podrabotka-i-rabota": "zadachi-podrabotka",
  "meropriyatiya-i-organizatsiya": "zadachi-pomosh-na-meropriyatiyah",
  "ofis-i-dokumenty": "zadachi-drugoe",
  "pomoshch-s-avto": "zadachi-nayti-avto",
  "zadachi-drugoe": "zadachi-drugoe",
  // tasks — parents
  "zadachi-perevozki-i-dostavka": "zadachi-dostavka-i-perevozki",
  "zadachi-kompyutery-i-tehnika": "zadachi-tehnika-i-it",
  "zadachi-arenda-i-poisk": "zadachi-arenda",
  // services — leaves
  "avto-uslugi": "uslugi-avtoservis",
  "uslugi-avtouslugi": "uslugi-avtoservis",
  buhgalteriya: "uslugi-buhgalteriya",
  "kompyutery-i-tehnika": "uslugi-kompyutery",
  uborka: "uslugi-uborka",
  "krasota-i-zdorove": "uslugi-parikmacher",
  "perevozki-i-dostavka": "uslugi-dostavka",
  "yuridicheskie-uslugi": "uslugi-yurist",
  "uslugi-yuruslugi": "uslugi-yurist",
  "rieltory-i-zhile": "uslugi-rieltor",
  "uslugi-arenda-nedvizhimosti": "uslugi-arenda-zhilya",
  "uslugi-sdayu-zhilyo": "uslugi-arenda-zhilya",
  "uslugi-kommercheskaya-arenda": "uslugi-kommercheskaya-nedvizhimost",
  "uslugi-biznes-uslugi": "uslugi-marketing",
  "uslugi-prokat": "uslugi-drugoe",
  obuchenie: "uslugi-repetitory",
  "reklama-i-dizayn": "uslugi-dizayn",
  "foto-i-video": "uslugi-foto",
  "remont-bytovoy-tehniki": "uslugi-remont-tehniki",
  "remont-i-stroitelstvo": "uslugi-remont-kvartir",
  repetitory: "uslugi-repetitory",
  "uslugi-drugoe": "uslugi-drugoe",
  // services — parents
  "uslugi-perevozki-i-avto": "uslugi-avtouslugi-i-perevozki",
  "uslugi-biznes-i-arenda": "uslugi-biznes-i-dokumenty",
  "uslugi-nedvizhimost-i-arenda": "uslugi-nedvizhimost",
  // products — leaves
  "telefony-i-gadzhety": "tovary-telefony",
  "bytovaya-tehnika": "tovary-tehnika",
  "mebel-i-dom": "tovary-mebel",
  "odezhda-i-obuv": "tovary-odezhda",
  avto: "tovary-avtomobili",
  zhivotnye: "tovary-tovary-dlya-zhivotnyh",
  "tovary-zhivotnye": "tovary-tovary-dlya-zhivotnyh",
  besplatno: "tovary-drugoe",
  "kvartiry-i-doma": "tovary-kvartiry",
  "tovary-kommercheskaya": "tovary-kvartiry",
  "sport-i-otdyh": "tovary-sport",
  "tovary-otdyh": "tovary-turizm",
  "detskie-tovary": "tovary-detskaya-odezhda",
  "tovary-detskie-tovary": "tovary-igrushki",
  "avtozapchasti-i-shiny": "tovary-shiny",
  elektronika: "tovary-tehnika",
  "noutbuki-i-kompyutery": "tovary-noutbuki",
  komplektuyushchie: "tovary-zapchasti",
  avtotovary: "tovary-zapchasti",
  zapchasti: "tovary-zapchasti",
  "shiny-i-diski": "tovary-shiny",
  instrumenty: "tovary-instrumenty",
  "tovary-drugoe": "tovary-drugoe",
  // products — parents
  "tovary-odezhda-i-deti": "tovary-odezhda-i-aksessuary",
  "tovary-avto-i-zapchasti": "tovary-avto-i-transport",
  "tovary-hobbi-i-zhivotnye": "tovary-hobbi-i-otdyh",
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
  const slug = categoryToSlug(name, listingKind(listing.type));
  return LEGACY_SLUG_TO_CANONICAL[slug] ?? slug;
}

/** Homepage parent slug used for counts and parent category browse. */
export function homeParentSlugForListing(
  listing: Pick<Listing, "categorySlug" | "categoryName" | "type">,
): string {
  const leaf = canonicalCategorySlugForListing(listing);
  if (!leaf) return "";
  const parent = homeParentSlugForLeafSlug(leaf);
  if (parent) return parent;
  const mappedParent = LEGACY_SLUG_TO_CANONICAL[leaf];
  if (mappedParent) return homeParentSlugForLeafSlug(mappedParent) ?? mappedParent;
  return leaf;
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
