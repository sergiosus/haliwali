export type CatalogCategory = {
  slug: string;
  title: string;
  subtitle: string;
  iconKey: string;
  sortOrder: number;
  companyCount: number;
};

export type CatalogCompanyContact = {
  type: "phone" | "email" | "other";
  value: string;
};

export type CatalogCompanyListItem = {
  slug: string;
  name: string;
  categorySlug: string;
  categoryTitle: string;
  city: string;
  description: string;
  logoUrl: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
};

/** Admin-only: includes DB id for merge/import/edit */
export type CatalogCompanyAdminItem = CatalogCompanyListItem & {
  id: number;
  website: string | null;
};

export type CatalogCompanyProfile = CatalogCompanyListItem & {
  address: string;
  website: string | null;
  images: string[];
  contacts: CatalogCompanyContact[];
  services: string[];
};

export type CatalogReport = {
  id: number;
  companyId: number | null;
  companyName: string | null;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
};

export type CatalogCompanyImportRow = {
  name: string;
  category: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
};

export const CATALOG_CATEGORY_SEED: readonly Omit<CatalogCategory, "companyCount">[] = [
  { slug: "auto", title: "Авто", subtitle: "Сервисы, запчасти, автоуслуги", iconKey: "auto", sortOrder: 10 },
  {
    slug: "stroitelstvo",
    title: "Строительство",
    subtitle: "Подрядчики и материалы",
    iconKey: "build",
    sortOrder: 20,
  },
  { slug: "remont", title: "Ремонт", subtitle: "Ремонт и отделка", iconKey: "repair", sortOrder: 30 },
  {
    slug: "perevozki",
    title: "Перевозки",
    subtitle: "Грузоперевозки и логистика",
    iconKey: "truck",
    sortOrder: 40,
  },
  { slug: "tekhnika", title: "Техника", subtitle: "Оборудование и сервис", iconKey: "gear", sortOrder: 50 },
  { slug: "magaziny", title: "Магазины", subtitle: "Розница и опт", iconKey: "shop", sortOrder: 60 },
  { slug: "drugie", title: "Другие", subtitle: "Прочие компании", iconKey: "other", sortOrder: 70 },
] as const;
