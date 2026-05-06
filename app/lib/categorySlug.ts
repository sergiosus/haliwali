import { slugify } from "./slugify";

/**
 * Canonical URL slug for category names. Shared by client UI and server routes (counts, links).
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
      // Existing canonical tasks
      "Нужен мастер": "nuzhen-master",
      "Помощь по дому": "pomosh-po-domu",
      Доставка: "dostavka",
      "Разовые задания": "razovye-zadaniya",
      "Срочно сегодня": "srochno-segodnya",
      "Удалённые задачи": "udalennye-zadachi",
      "Подработка и смены": "podrabotka-i-smeny",
      "Мероприятия и организация": "meropriyatiya-i-organizatsiya",
      "Офис и документы": "ofis-i-dokumenty",
      "Помощь с авто": "pomoshch-s-avto",

      // Avito-style broad task buckets (type-specific slugs to avoid collisions)
      "Курьерские поручения": "zadachi-kurerskie-porucheniya",
      "Компьютерная помощь": "zadachi-kompyuternaya-pomoshch",
      "Ремонт техники": "zadachi-remont-tehniki",
      "Ремонт и строительство": "zadachi-remont-i-stroitelstvo",
      Перевозки: "zadachi-perevozki",
      Уборка: "zadachi-uborka",
      "Организация мероприятий": "zadachi-organizatsiya-meropriyatiy",
      "Фото и видео задачи": "zadachi-foto-i-video",
    },
    service: {
      // Existing canonical services
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

      // Extra broad buckets (distinct slugs)
      Бухгалтерия: "buhgalteriya",
      "Реклама и дизайн": "reklama-i-dizayn",
      "Ремонт бытовой техники": "remont-bytovoy-tehniki",
      Репетиторы: "repetitory",
    },
    product_sell: {
      // Existing canonical products
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

      // Extra broad buckets (distinct slugs)
      Электроника: "elektronika",
      "Ноутбуки и компьютеры": "noutbuki-i-kompyutery",
      Комплектующие: "komplektuyushchie",
      Автотовары: "avtotovary",
      Запчасти: "zapchasti",
      "Шины и диски": "shiny-i-diski",
      Инструменты: "instrumenty",
    },
    product_buy: {
      // Same slugs as sell
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

  return mapByType[type]?.[name] ?? slugify(name);
}
