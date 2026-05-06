"use client";

import {
  categoryToSlug,
  compareRuCategoryLabels,
  productCategories,
  serviceCategories,
  taskCategories,
} from "./categories";
import { cityNames } from "./cities";

/** Major Russian cities for combobox presets; duplicates removed; locale-sorted */
export const russianCities = (() => {
  const raw = [...cityNames, "Другое"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b, "ru"));
})() as readonly string[];

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

export const allDirectoryItems: DirectoryItem[] = directoryColumns.flatMap((c) =>
  c.items.map((i) => ({ ...i, tab: c.tab })),
);

export function getDirectoryItemBySlug(slug: string): DirectoryItem | null {
  return allDirectoryItems.find((i) => i.slug === slug) ?? null;
}

export function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

/** Homepage has exactly 3 primary blocks with rich subcategories inside each block. */
const HOME_CATEGORY_GRID_RAW: {
  heading: "Задачи" | "Услуги" | "Товары";
  links: { label: string; slug: string }[];
}[] = [
  {
    heading: "Задачи",
    links: [
      { label: "Доставка", slug: categoryToSlug("Доставка", "task") },
      { label: "Курьерские поручения", slug: categoryToSlug("Курьерские поручения", "task") },
      { label: "Компьютерная помощь", slug: categoryToSlug("Компьютерная помощь", "task") },
      { label: "Нужен мастер", slug: categoryToSlug("Нужен мастер", "task") },
      { label: "Ремонт техники", slug: categoryToSlug("Ремонт техники", "task") },
      { label: "Ремонт и строительство", slug: categoryToSlug("Ремонт и строительство", "task") },
      { label: "Перевозки", slug: categoryToSlug("Перевозки", "task") },
      { label: "Помощь по дому", slug: categoryToSlug("Помощь по дому", "task") },
      { label: "Уборка", slug: categoryToSlug("Уборка", "task") },
      { label: "Разовые задания", slug: categoryToSlug("Разовые задания", "task") },
      { label: "Срочно сегодня", slug: categoryToSlug("Срочно сегодня", "task") },
      { label: "Удалённые задачи", slug: categoryToSlug("Удалённые задачи", "task") },
      { label: "Организация мероприятий", slug: categoryToSlug("Организация мероприятий", "task") },
      { label: "Фото и видео задачи", slug: categoryToSlug("Фото и видео задачи", "task") },
      { label: "Другое", slug: categoryToSlug("Другое", "task") },
    ],
  },
  {
    heading: "Услуги",
    links: [
      { label: "Автоуслуги", slug: categoryToSlug("Автоуслуги", "service") },
      { label: "Бухгалтерия", slug: categoryToSlug("Бухгалтерия", "service") },
      { label: "Компьютеры и техника", slug: categoryToSlug("Компьютеры и техника", "service") },
      { label: "Уборка", slug: categoryToSlug("Уборка", "service") },
      { label: "Перевозки", slug: categoryToSlug("Перевозки и доставка", "service") },
      { label: "Красота и здоровье", slug: categoryToSlug("Красота и здоровье", "service") },
      { label: "Юридические услуги", slug: categoryToSlug("Юридические услуги", "service") },
      { label: "Недвижимость услуги", slug: categoryToSlug("Недвижимость услуги", "service") },
      { label: "Обучение", slug: categoryToSlug("Обучение", "service") },
      { label: "Реклама и дизайн", slug: categoryToSlug("Реклама и дизайн", "service") },
      { label: "Фото и видео", slug: categoryToSlug("Фото и видео", "service") },
      { label: "Ремонт бытовой техники", slug: categoryToSlug("Ремонт бытовой техники", "service") },
      { label: "Ремонт и строительство", slug: categoryToSlug("Ремонт и строительство", "service") },
      { label: "Репетиторы", slug: categoryToSlug("Репетиторы", "service") },
      { label: "Другое", slug: categoryToSlug("Другое", "service") },
    ],
  },
  {
    heading: "Товары",
    links: [
      { label: "Автотовары", slug: categoryToSlug("Автотовары", "product_sell") },
      { label: "Телефоны и гаджеты", slug: categoryToSlug("Телефоны и гаджеты", "product_sell") },
      { label: "Электроника", slug: categoryToSlug("Электроника", "product_sell") },
      { label: "Ноутбуки и компьютеры", slug: categoryToSlug("Ноутбуки и компьютеры", "product_sell") },
      { label: "Бытовая техника", slug: categoryToSlug("Бытовая техника", "product_sell") },
      { label: "Детские товары", slug: categoryToSlug("Детские товары", "product_sell") },
      { label: "Животные", slug: categoryToSlug("Животные", "product_sell") },
      { label: "Запчасти", slug: categoryToSlug("Запчасти", "product_sell") },
      { label: "Инструменты", slug: categoryToSlug("Инструменты", "product_sell") },
      { label: "Комплектующие", slug: categoryToSlug("Комплектующие", "product_sell") },
      { label: "Мебель и дом", slug: categoryToSlug("Мебель и дом", "product_sell") },
      { label: "Одежда и обувь", slug: categoryToSlug("Одежда и обувь", "product_sell") },
      { label: "Спорт и отдых", slug: categoryToSlug("Спорт и отдых", "product_sell") },
      { label: "Бесплатно", slug: categoryToSlug("Бесплатно", "product_sell") },
      { label: "Шины и диски", slug: categoryToSlug("Шины и диски", "product_sell") },
      { label: "Другое", slug: categoryToSlug("Другое", "product_sell") },
    ],
  },
];

export const homeCategoryGridSections = HOME_CATEGORY_GRID_RAW.map((section) => ({
  ...section,
  links: (() => {
    const sorted = [...section.links].sort((x, y) => compareRuCategoryLabels(x.label, y.label));
    // Strict category binding: one UI row == one category slug (no alias labels sharing same slug).
    const seen = new Set<string>();
    const out: { label: string; slug: string }[] = [];
    for (const l of sorted) {
      const s = (l.slug ?? "").trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(l);
    }
    return out;
  })(),
}));

export { slugify } from "./slugify";
