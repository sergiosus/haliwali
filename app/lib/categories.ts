import { categoryToSlug, parentCategoryToSlug } from "./categorySlug";

export { categoryToSlug, parentCategoryToSlug } from "./categorySlug";

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

export type HomeCategoryLink = { label: string; slug: string };
export type HomeCategoryGroup = {
  title: string;
  parentSlug: string;
  /** Leaf subcategories (not shown on homepage). */
  links: HomeCategoryLink[];
};
export type HomeCategoryColumnHeading = "Задачи" | "Услуги" | "Товары";

export type HomeCategorySection = {
  heading: HomeCategoryColumnHeading;
  /** Parent rows only — homepage visible links. */
  links: HomeCategoryLink[];
  /** Metadata: parent → leaf subcategories. */
  groups: HomeCategoryGroup[];
};

const TASK_GROUPS_RAW: { title: string; subs: readonly string[] }[] = [
  {
    title: "Дом и ремонт",
    subs: ["уборка", "сантехника", "электрика", "собрать мебель", "мелкий ремонт"],
  },
  {
    title: "Доставка и перевозки",
    subs: ["курьер", "доставка", "грузчики", "переезд", "вывезти мусор"],
  },
  {
    title: "Техника и IT",
    subs: ["настроить ПК", "починить технику", "помощь с телефоном", "интернет и настройка"],
  },
  {
    title: "Работа и помощь",
    subs: [
      "вакансии",
      "подработка",
      "найти помощника",
      "разнорабочий",
      "поиск исполнителя",
      "помощь на мероприятиях",
    ],
  },
  {
    title: "Аренда",
    subs: ["найти жильё", "найти гараж", "найти авто", "поиск аренды"],
  },
  { title: "Другое", subs: ["Другое"] },
];

const SERVICE_GROUPS_RAW: { title: string; subs: readonly string[] }[] = [
  {
    title: "Ремонт и строительство",
    subs: ["ремонт квартир", "строительство", "сантехника", "электрика", "отделка"],
  },
  {
    title: "IT и техника",
    subs: ["ремонт техники", "компьютеры", "сайты", "настройка", "видеонаблюдение"],
  },
  {
    title: "Красота и здоровье",
    subs: ["парикмахер", "маникюр", "массаж", "косметология"],
  },
  {
    title: "Дом и быт",
    subs: ["уборка", "няни", "сиделки", "помощь по дому"],
  },
  {
    title: "Автоуслуги и перевозки",
    subs: ["эвакуатор", "грузоперевозки", "доставка", "автосервис"],
  },
  {
    title: "Обучение и медиа",
    subs: ["репетиторы", "фото", "видео", "дизайн"],
  },
  {
    title: "Бизнес и документы",
    subs: ["бухгалтерия", "юрист", "реклама", "маркетинг"],
  },
  {
    title: "Недвижимость",
    subs: ["аренда жилья", "риелтор", "коммерческая недвижимость", "аренда гаражей"],
  },
  { title: "Другое", subs: ["Другое"] },
];

const PRODUCT_GROUPS_RAW: { title: string; subs: readonly string[] }[] = [
  {
    title: "Электроника",
    subs: ["телефоны", "компьютеры", "ноутбуки", "техника"],
  },
  {
    title: "Дом и мебель",
    subs: ["мебель", "товары для дома", "инструменты"],
  },
  {
    title: "Одежда и аксессуары",
    subs: ["одежда", "обувь", "сумки", "украшения"],
  },
  {
    title: "Детские товары",
    subs: ["игрушки", "коляски", "детская одежда"],
  },
  {
    title: "Авто и транспорт",
    subs: ["автомобили", "мото", "велосипеды", "спецтехника"],
  },
  {
    title: "Запчасти и аксессуары",
    subs: ["запчасти", "шины", "диски", "аккумуляторы"],
  },
  {
    title: "Недвижимость",
    subs: ["квартиры", "дома", "участки", "гаражи"],
  },
  {
    title: "Бизнес и оборудование",
    subs: ["оборудование", "станки", "товары для бизнеса"],
  },
  {
    title: "Хобби и отдых",
    subs: ["спорт", "книги", "музыка", "туризм"],
  },
  {
    title: "Животные",
    subs: [
      "кошки",
      "собаки",
      "птицы",
      "грызуны",
      "рептилии",
      "аквариумистика",
      "товары для животных",
    ],
  },
  { title: "Другое", subs: ["Другое"] },
];

function buildHomeSection(
  heading: HomeCategoryColumnHeading,
  groupsRaw: { title: string; subs: readonly string[] }[],
  type: "task" | "service" | "product_sell",
): HomeCategorySection {
  const groups: HomeCategoryGroup[] = groupsRaw.map((g) => {
    const parentSlug = parentCategoryToSlug(g.title, type);
    return {
      title: g.title,
      parentSlug,
      links: g.subs.map((label) => ({
        label,
        slug: categoryToSlug(label, type),
      })),
    };
  });
  const links: HomeCategoryLink[] = groups.map((g) => ({
    label: g.title,
    slug: g.parentSlug,
  }));
  return { heading, groups, links };
}

export const homeCategoryGridSections: HomeCategorySection[] = [
  buildHomeSection("Задачи", TASK_GROUPS_RAW, "task"),
  buildHomeSection("Услуги", SERVICE_GROUPS_RAW, "service"),
  buildHomeSection("Товары", PRODUCT_GROUPS_RAW, "product_sell"),
];

const HOME_PARENT_SLUGS = new Set(
  homeCategoryGridSections.flatMap((s) => s.links.map((l) => l.slug)),
);

/** Leaf → parent within each column; parent slugs are unique per column (themes may repeat across columns). */
const LEAF_SLUG_TO_PARENT_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const section of homeCategoryGridSections) {
    for (const group of section.groups) {
      out[group.parentSlug] = group.parentSlug;
      for (const child of group.links) {
        out[child.slug] = group.parentSlug;
      }
    }
  }
  return out;
})();

const PARENT_GROUP_BY_SLUG: Record<string, HomeCategoryGroup> = (() => {
  const out: Record<string, HomeCategoryGroup> = {};
  for (const section of homeCategoryGridSections) {
    for (const group of section.groups) {
      out[group.parentSlug] = group;
    }
  }
  return out;
})();

export function isHomeParentCategorySlug(slug: string): boolean {
  return HOME_PARENT_SLUGS.has((slug ?? "").trim());
}

export function homeParentSlugForLeafSlug(leafSlug: string): string | null {
  const s = (leafSlug ?? "").trim();
  if (!s) return null;
  return LEAF_SLUG_TO_PARENT_SLUG[s] ?? null;
}

export function getHomeParentGroup(slug: string): HomeCategoryGroup | null {
  const s = (slug ?? "").trim();
  if (!s) return null;
  return PARENT_GROUP_BY_SLUG[s] ?? null;
}

/** Subcategory links shown when a parent is expanded on the homepage (excludes parent-only «Другое» row). */
export function homeGroupChildLinks(group: HomeCategoryGroup): HomeCategoryLink[] {
  return group.links.filter((c) => c.slug !== group.parentSlug);
}

export function homeGroupHasExpandableChildren(group: HomeCategoryGroup): boolean {
  return homeGroupChildLinks(group).length > 0;
}

/** Dedupe leaf titles within one column only (not across Задачи / Услуги / Товары). */
function leafTitles(groupsRaw: { subs: readonly string[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groupsRaw) {
    for (const sub of g.subs) {
      if (seen.has(sub)) continue;
      seen.add(sub);
      out.push(sub);
    }
  }
  return out;
}

const TASK_CATEGORY_TITLES = leafTitles(TASK_GROUPS_RAW);
const SERVICE_CATEGORY_TITLES = leafTitles(SERVICE_GROUPS_RAW);
const PRODUCT_CATEGORY_TITLES = leafTitles(PRODUCT_GROUPS_RAW);

export const taskCategories = finalizeCategoryOrdering(TASK_CATEGORY_TITLES);
export const serviceCategories = finalizeCategoryOrdering(SERVICE_CATEGORY_TITLES);
export const productCategories = finalizeCategoryOrdering(PRODUCT_CATEGORY_TITLES);

export type TaskCategoryName = (typeof taskCategories)[number];
export type ServiceCategoryName = (typeof serviceCategories)[number];
export type ProductCategoryName = (typeof productCategories)[number];
