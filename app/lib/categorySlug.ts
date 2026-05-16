import { slugify } from "./slugify";

/**
 * Canonical URL slug for category names. Shared by client UI and server routes (counts, links).
 * Legacy slugs remain valid via directory + categoryLegacyMap.
 */
export function categoryToSlug(
  name: string,
  type: "task" | "service" | "product_sell" | "product_buy",
): string {
  const mapByType: Record<
    "task" | "service" | "product_sell" | "product_buy",
    Record<string, string>
  > = {
    task: {
      уборка: "zadachi-uborka",
      сантехника: "zadachi-santehnika",
      электрика: "zadachi-elektrika",
      "сборка мебели": "zadachi-sborka-mebeli",
      "помощь по дому": "zadachi-pomosh-po-domu",
      курьер: "zadachi-kurer",
      грузчики: "zadachi-gruzchiki",
      переезд: "zadachi-pereezd",
      доставка: "zadachi-dostavka",
      "настройка ПК": "zadachi-nastroyka-pk",
      "ремонт техники": "zadachi-remont-tehniki",
      "помощь с телефоном": "zadachi-pomosh-s-telefonom",
      "подработка и работа": "zadachi-podrabotka-i-rabota",
      "поиск исполнителя": "zadachi-poisk-ispolnitelya",
      "разовые поручения": "zadachi-razovye-porucheniya",
      "найти жильё": "zadachi-nayti-zhilyo",
      "найти авто": "zadachi-nayti-avto",
      "поиск аренды": "zadachi-poisk-arendy",
      // legacy task titles (stable slugs)
      Доставка: "dostavka",
      "Курьерские поручения": "zadachi-kurerskie-porucheniya",
      "Компьютерная помощь": "zadachi-kompyuternaya-pomoshch",
      "Нужен мастер": "nuzhen-master",
      "Ремонт техники": "zadachi-remont-tehniki",
      "Ремонт и строительство": "zadachi-remont-i-stroitelstvo",
      Перевозки: "zadachi-perevozki",
      "Помощь по дому": "pomosh-po-domu",
      Уборка: "zadachi-uborka",
      "Разовые задания": "razovye-zadaniya",
      "Срочно сегодня": "srochno-segodnya",
      "Удалённые задачи": "udalennye-zadachi",
      "Организация мероприятий": "zadachi-organizatsiya-meropriyatiy",
      "Фото и видео задачи": "zadachi-foto-i-video",
      "Подработка и смены": "podrabotka-i-smeny",
      "Мероприятия и организация": "meropriyatiya-i-organizatsiya",
      "Офис и документы": "ofis-i-dokumenty",
      "Помощь с авто": "pomoshch-s-avto",
    },
    service: {
      "ремонт квартир": "uslugi-remont-kvartir",
      сантехника: "uslugi-santehnika",
      электрика: "uslugi-elektrika",
      отделка: "uslugi-otdelka",
      "ремонт техники": "uslugi-remont-tehniki",
      компьютеры: "uslugi-kompyutery",
      сайты: "uslugi-sayty",
      настройка: "uslugi-nastroyka",
      парикмахер: "uslugi-parikmacher",
      маникюр: "uslugi-manikyur",
      массаж: "uslugi-massazh",
      уборка: "uslugi-uborka",
      "помощь по дому": "uslugi-pomosh-po-domu",
      доставка: "uslugi-dostavka",
      грузоперевозки: "uslugi-gruzoperevozki",
      эвакуатор: "uslugi-evakuator",
      автоуслуги: "uslugi-avtouslugi",
      репетиторы: "uslugi-repetitory",
      фото: "uslugi-foto",
      видео: "uslugi-video",
      юруслуги: "uslugi-yuruslugi",
      бухгалтерия: "uslugi-buhgalteriya",
      "аренда недвижимости": "uslugi-arenda-nedvizhimosti",
      "сдаю жильё": "uslugi-sdayu-zhilyo",
      "коммерческая аренда": "uslugi-kommercheskaya-arenda",
      "бизнес-услуги": "uslugi-biznes-uslugi",
      прокат: "uslugi-prokat",
      // legacy service titles
      "Ремонт и строительство": "remont-i-stroitelstvo",
      "Компьютеры и техника": "kompyutery-i-tehnika",
      Уборка: "uborka",
      "Перевозки и доставка": "perevozki-i-dostavka",
      "Красота и здоровье": "krasota-i-zdorove",
      Обучение: "obuchenie",
      "Авто услуги": "avto-uslugi",
      "Риелторы и жильё": "rieltory-i-zhile",
      "Юридические услуги": "yuridicheskie-uslugi",
      "Фото и видео": "foto-i-video",
      Бухгалтерия: "buhgalteriya",
      "Реклама и дизайн": "reklama-i-dizayn",
      "Ремонт бытовой техники": "remont-bytovoy-tehniki",
      Репетиторы: "uslugi-repetitory",
      Автоуслуги: "uslugi-avtouslugi",
    },
    product_sell: {
      телефоны: "tovary-telefony",
      компьютеры: "tovary-kompyutery",
      техника: "tovary-tehnika",
      мебель: "tovary-mebel",
      "товары для дома": "tovary-tovary-dlya-doma",
      одежда: "tovary-odezhda",
      обувь: "tovary-obuv",
      "детские товары": "tovary-detskie-tovary",
      автомобили: "tovary-avtomobili",
      мото: "tovary-moto",
      запчасти: "tovary-zapchasti",
      шины: "tovary-shiny",
      квартиры: "tovary-kvartiry",
      дома: "tovary-doma",
      коммерческая: "tovary-kommercheskaya",
      оборудование: "tovary-oborudovanie",
      "товары для бизнеса": "tovary-tovary-dlya-biznesa",
      инструменты: "tovary-instrumenty",
      спорт: "tovary-sport",
      отдых: "tovary-otdyh",
      животные: "tovary-zhivotnye",
      // legacy product titles
      "Телефоны и гаджеты": "telefony-i-gadzhety",
      "Бытовая техника": "bytovaya-tehnika",
      "Мебель и дом": "mebel-i-dom",
      "Одежда и обувь": "odezhda-i-obuv",
      Авто: "avto",
      Животные: "zhivotnye",
      Бесплатно: "besplatno",
      "Квартиры и дома": "kvartiry-i-doma",
      "Спорт и отдых": "sport-i-otdyh",
      "Детские товары": "detskie-tovary",
      "Автозапчасти и шины": "avtozapchasti-i-shiny",
      Электроника: "elektronika",
      "Ноутбуки и компьютеры": "noutbuki-i-kompyutery",
      Комплектующие: "komplektuyushchie",
      Автотовары: "avtotovary",
      Запчасти: "zapchasti",
      "Шины и диски": "shiny-i-diski",
      Инструменты: "instrumenty",
    },
    product_buy: {
      телефоны: "tovary-telefony",
      компьютеры: "tovary-kompyutery",
      техника: "tovary-tehnika",
      мебель: "tovary-mebel",
      "товары для дома": "tovary-tovary-dlya-doma",
      одежда: "tovary-odezhda",
      обувь: "tovary-obuv",
      "детские товары": "tovary-detskie-tovary",
      автомобили: "tovary-avtomobili",
      мото: "tovary-moto",
      запчасти: "tovary-zapchasti",
      шины: "tovary-shiny",
      квартиры: "tovary-kvartiry",
      дома: "tovary-doma",
      коммерческая: "tovary-kommercheskaya",
      оборудование: "tovary-oborudovanie",
      "товары для бизнеса": "tovary-tovary-dlya-biznesa",
      инструменты: "tovary-instrumenty",
      спорт: "tovary-sport",
      отдых: "tovary-otdyh",
      животные: "tovary-zhivotnye",
      "Телефоны и гаджеты": "telefony-i-gadzhety",
      "Бытовая техника": "bytovaya-tehnika",
      "Мебель и дом": "mebel-i-dom",
      "Одежда и обувь": "odezhda-i-obuv",
      Авто: "avto",
      Животные: "zhivotnye",
      Бесплатно: "besplatno",
      "Квартиры и дома": "kvartiry-i-doma",
      "Спорт и отдых": "sport-i-otdyh",
      "Детские товары": "detskie-tovary",
      "Автозапчасти и шины": "avtozapchasti-i-shiny",
      Электроника: "elektronika",
      "Ноутбуки и компьютеры": "noutbuki-i-kompyutery",
      Комплектующие: "komplektuyushchie",
      Автотовары: "avtotovary",
      Запчасти: "zapchasti",
      "Шины и диски": "shiny-i-diski",
      Инструменты: "instrumenty",
    },
  };

  if (name === "Другое") {
    if (type === "task") return "zadachi-drugoe";
    if (type === "service") return "uslugi-drugoe";
    return "tovary-drugoe";
  }

  const explicit = mapByType[type]?.[name];
  if (explicit) return explicit;
  const prefix = type === "task" ? "zadachi" : type === "service" ? "uslugi" : "tovary";
  return `${prefix}-${slugify(name)}`;
}

/** Broad homepage / parent browse slugs (not leaf subcategories). */
export function parentCategoryToSlug(
  name: string,
  type: "task" | "service" | "product_sell" | "product_buy",
): string {
  const mapByType: Record<
    "task" | "service" | "product_sell" | "product_buy",
    Record<string, string>
  > = {
    task: {
      "Дом и ремонт": "zadachi-dom-i-remont",
      "Перевозки и доставка": "zadachi-perevozki-i-dostavka",
      "Компьютеры и техника": "zadachi-kompyutery-i-tehnika",
      "Работа и помощь": "zadachi-rabota-i-pomosh",
      "Аренда и поиск": "zadachi-arenda-i-poisk",
      Другое: "zadachi-drugoe",
    },
    service: {
      "Ремонт и строительство": "uslugi-remont-i-stroitelstvo",
      "IT и техника": "uslugi-it-i-tehnika",
      "Красота и здоровье": "uslugi-krasota-i-zdorove",
      "Дом и быт": "uslugi-dom-i-byt",
      "Перевозки и авто": "uslugi-perevozki-i-avto",
      "Обучение и медиа": "uslugi-obuchenie-i-media",
      "Бизнес и аренда": "uslugi-biznes-i-arenda",
      "Недвижимость и аренда": "uslugi-nedvizhimost-i-arenda",
      Другое: "uslugi-drugoe",
    },
    product_sell: {
      Электроника: "tovary-elektronika",
      "Дом и мебель": "tovary-dom-i-mebel",
      "Одежда и дети": "tovary-odezhda-i-deti",
      "Авто и запчасти": "tovary-avto-i-zapchasti",
      Недвижимость: "tovary-nedvizhimost",
      "Бизнес и оборудование": "tovary-biznes-i-oborudovanie",
      "Хобби и животные": "tovary-hobbi-i-zhivotnye",
      Другое: "tovary-drugoe",
    },
    product_buy: {
      Электроника: "tovary-elektronika",
      "Дом и мебель": "tovary-dom-i-mebel",
      "Одежда и дети": "tovary-odezhda-i-deti",
      "Авто и запчасти": "tovary-avto-i-zapchasti",
      Недвижимость: "tovary-nedvizhimost",
      "Бизнес и оборудование": "tovary-biznes-i-oborudovanie",
      "Хобби и животные": "tovary-hobbi-i-zhivotnye",
      Другое: "tovary-drugoe",
    },
  };

  if (name === "Другое") {
    if (type === "task") return "zadachi-drugoe";
    if (type === "service") return "uslugi-drugoe";
    return "tovary-drugoe";
  }

  const explicit = mapByType[type]?.[name];
  if (explicit) return explicit;
  const prefix = type === "task" ? "zadachi" : type === "service" ? "uslugi" : "tovary";
  return `${prefix}-gruppa-${slugify(name)}`;
}
