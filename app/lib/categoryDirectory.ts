/**
 * Server-safe category directory (no "use client").
 * Used by generateMetadata, category routes, and re-exported from directory.ts for client UI.
 */

import {
  categoryToSlug,
  homeCategoryGridSections,
  productCategories,
  serviceCategories,
  taskCategories,
} from "./categories";

export type DirectoryTab = "tasks" | "services" | "products";

export type DirectoryItem = {
  tab: DirectoryTab;
  title: string;
  slug: string;
  listingTypes: ("task" | "service" | "product_sell" | "product_buy")[];
};

export const directoryColumns: {
  tab: DirectoryTab;
  heading: string;
  items: Omit<DirectoryItem, "tab">[];
}[] = [
  {
    tab: "tasks",
    heading: "Задачи",
    items: taskCategories.map((title) => ({
      title,
      slug: categoryToSlug(title, "task"),
      listingTypes: ["task"],
    })),
  },
  {
    tab: "services",
    heading: "Услуги",
    items: serviceCategories.map((title) => ({
      title,
      slug: categoryToSlug(title, "service"),
      listingTypes: ["service"],
    })),
  },
  {
    tab: "products",
    heading: "Товары",
    items: productCategories.map((title) => ({
      title,
      slug: categoryToSlug(title, "product_sell"),
      listingTypes: ["product_sell", "product_buy"],
    })),
  },
];

/** Legacy leaf slugs/titles — keep old /category/* URLs working. */
const LEGACY_DIRECTORY_ITEMS: Omit<DirectoryItem, "tab">[] = [
  { title: "Доставка", slug: "dostavka", listingTypes: ["task"] },
  { title: "Курьерские поручения", slug: "zadachi-kurerskie-porucheniya", listingTypes: ["task"] },
  { title: "Компьютерная помощь", slug: "zadachi-kompyuternaya-pomoshch", listingTypes: ["task"] },
  { title: "Нужен мастер", slug: "nuzhen-master", listingTypes: ["task"] },
  { title: "Ремонт и строительство", slug: "zadachi-remont-i-stroitelstvo", listingTypes: ["task"] },
  { title: "Перевозки", slug: "zadachi-perevozki", listingTypes: ["task"] },
  { title: "Помощь по дому", slug: "pomosh-po-domu", listingTypes: ["task"] },
  { title: "Разовые задания", slug: "razovye-zadaniya", listingTypes: ["task"] },
  { title: "Срочно сегодня", slug: "srochno-segodnya", listingTypes: ["task"] },
  { title: "Удалённые задачи", slug: "udalennye-zadachi", listingTypes: ["task"] },
  { title: "Организация мероприятий", slug: "zadachi-organizatsiya-meropriyatiy", listingTypes: ["task"] },
  { title: "Фото и видео задачи", slug: "zadachi-foto-i-video", listingTypes: ["task"] },
  { title: "Подработка и смены", slug: "podrabotka-i-smeny", listingTypes: ["task"] },
  { title: "Ремонт и строительство", slug: "remont-i-stroitelstvo", listingTypes: ["service"] },
  { title: "Компьютеры и техника", slug: "kompyutery-i-tehnika", listingTypes: ["service"] },
  { title: "Перевозки и доставка", slug: "perevozki-i-dostavka", listingTypes: ["service"] },
  { title: "Красота и здоровье", slug: "krasota-i-zdorove", listingTypes: ["service"] },
  { title: "Юридические услуги", slug: "yuridicheskie-uslugi", listingTypes: ["service"] },
  { title: "Недвижимость услуги", slug: "rieltory-i-zhile", listingTypes: ["service"] },
  { title: "Обучение", slug: "obuchenie", listingTypes: ["service"] },
  { title: "Реклама и дизайн", slug: "reklama-i-dizayn", listingTypes: ["service"] },
  { title: "Ремонт бытовой техники", slug: "remont-bytovoy-tehniki", listingTypes: ["service"] },
  { title: "Телефоны и гаджеты", slug: "telefony-i-gadzhety", listingTypes: ["product_sell", "product_buy"] },
  { title: "Бытовая техника", slug: "bytovaya-tehnika", listingTypes: ["product_sell", "product_buy"] },
  { title: "Мебель и дом", slug: "mebel-i-dom", listingTypes: ["product_sell", "product_buy"] },
  { title: "Одежда и обувь", slug: "odezhda-i-obuv", listingTypes: ["product_sell", "product_buy"] },
  { title: "Бесплатно", slug: "besplatno", listingTypes: ["product_sell", "product_buy"] },
  { title: "Квартиры и дома", slug: "kvartiry-i-doma", listingTypes: ["product_sell", "product_buy"] },
  { title: "Спорт и отдых", slug: "sport-i-otdyh", listingTypes: ["product_sell", "product_buy"] },
  { title: "Электроника", slug: "elektronika", listingTypes: ["product_sell", "product_buy"] },
  { title: "Ноутбуки и компьютеры", slug: "noutbuki-i-kompyutery", listingTypes: ["product_sell", "product_buy"] },
  { title: "Комплектующие", slug: "komplektuyushchie", listingTypes: ["product_sell", "product_buy"] },
  { title: "Автотовары", slug: "avtotovary", listingTypes: ["product_sell", "product_buy"] },
  { title: "Шины и диски", slug: "shiny-i-diski", listingTypes: ["product_sell", "product_buy"] },
];

const canonicalLeafSlugs = new Set(directoryColumns.flatMap((c) => c.items.map((i) => i.slug)));

/** Homepage parent rows — one entry per column (same theme may repeat across columns with different slugs). */
const parentDirectoryItems: DirectoryItem[] = homeCategoryGridSections.flatMap((section) => {
  const tab: DirectoryTab =
    section.heading === "Задачи" ? "tasks"
    : section.heading === "Услуги" ? "services"
    : "products";
  const listingTypes: DirectoryItem["listingTypes"] =
    tab === "tasks" ? ["task"]
    : tab === "services" ? ["service"]
    : ["product_sell", "product_buy"];
  return section.links.map((link) => ({
    tab,
    title: link.label,
    slug: link.slug,
    listingTypes,
  }));
});

const legacyDirectoryWithTab: DirectoryItem[] = LEGACY_DIRECTORY_ITEMS.filter(
  (i) => !canonicalLeafSlugs.has(i.slug),
).map((item) => ({
  ...item,
  tab:
    item.listingTypes.includes("task") ? "tasks"
    : item.listingTypes.includes("service") ? "services"
    : "products",
}));

export const allDirectoryItems: DirectoryItem[] = [
  ...directoryColumns.flatMap((c) => c.items.map((i) => ({ ...i, tab: c.tab }))),
  ...parentDirectoryItems,
  ...legacyDirectoryWithTab,
];

export function getDirectoryItemBySlug(slug: string): DirectoryItem | null {
  const s = (slug ?? "").trim();
  if (!s) return null;
  return allDirectoryItems.find((i) => i.slug === s) ?? null;
}

export function categoryTitleFromSlug(slug: string): string | null {
  return getDirectoryItemBySlug(slug)?.title ?? null;
}

export function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

export { homeCategoryGridSections };
