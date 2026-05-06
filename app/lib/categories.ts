export { categoryToSlug } from "./categorySlug";

export const CATEGORY_OTHER_LABEL = "Другое";

/** Алфавит `ru`; «Другое» всегда в конце. */
export function compareRuCategoryLabels(a: string, b: string): number {
  const other = CATEGORY_OTHER_LABEL;
  const ae = a.trim() === other;
  const be = b.trim() === other;
  if (ae !== be) return ae ? 1 : -1;
  return a.localeCompare(b, "ru", { sensitivity: "base" });
}

function finalizeCategoryOrdering<const T extends readonly string[]>(titles: T): T {
  return [...titles].sort(compareRuCategoryLabels) as unknown as T;
}

const TASK_CATEGORY_TITLES = [
  "Доставка",
  "Курьерские поручения",
  "Компьютерная помощь",
  "Нужен мастер",
  "Ремонт техники",
  "Ремонт и строительство",
  "Перевозки",
  "Помощь по дому",
  "Уборка",
  "Разовые задания",
  "Удалённые задачи",
  "Срочно сегодня",
  "Организация мероприятий",
  "Фото и видео задачи",
  "Другое",
] as const;

const SERVICE_CATEGORY_TITLES = [
  "Автоуслуги",
  "Бухгалтерия",
  "Компьютеры и техника",
  "Красота и здоровье",
  "Недвижимость услуги",
  "Обучение",
  "Перевозки",
  "Реклама и дизайн",
  "Ремонт бытовой техники",
  "Ремонт и строительство",
  "Репетиторы",
  "Уборка",
  "Юридические услуги",
  "Фото и видео",
  "Другое",
] as const;

const PRODUCT_CATEGORY_TITLES = [
  "Автотовары",
  "Бесплатно",
  "Телефоны и гаджеты",
  "Электроника",
  "Ноутбуки и компьютеры",
  "Бытовая техника",
  "Комплектующие",
  "Инструменты",
  "Мебель и дом",
  "Одежда и обувь",
  "Животные",
  "Спорт и отдых",
  "Детские товары",
  "Запчасти",
  "Шины и диски",
  "Другое",
] as const;

export const taskCategories = finalizeCategoryOrdering(TASK_CATEGORY_TITLES);
export const serviceCategories = finalizeCategoryOrdering(SERVICE_CATEGORY_TITLES);
export const productCategories = finalizeCategoryOrdering(PRODUCT_CATEGORY_TITLES);

export type TaskCategoryName = (typeof taskCategories)[number];
export type ServiceCategoryName = (typeof serviceCategories)[number];
export type ProductCategoryName = (typeof productCategories)[number];
