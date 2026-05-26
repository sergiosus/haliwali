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

export type CatalogCompanyProfileStatus = "imported" | "verified";
export type CatalogCompanyOrigin =
  | "imported_by_admin"
  | "imported_public"
  | "owner_submitted"
  | "user_submitted";
export type CatalogCompanyOwnershipStatus =
  | "imported_public"
  | "owner_submitted"
  | "claim_pending"
  | "verified_owner";

export type CatalogCompanyListItem = {
  slug: string;
  name: string;
  categorySlug: string;
  categoryTitle: string;
  city: string;
  serviceCities: string[];
  locationContext: string | null;
  address: string;
  description: string;
  logoUrl: string | null;
  website: string | null;
  /** First phone contact, for imported cards without a website. */
  phone?: string | null;
  origin: CatalogCompanyOrigin;
  profileStatus: CatalogCompanyProfileStatus;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
};

/** Admin-only: includes DB id for merge/import/edit */
export type CatalogCompanyAdminItem = CatalogCompanyListItem & {
  id: number;
  contacts?: CatalogCompanyContact[];
};

export type CatalogCompanyProfile = CatalogCompanyListItem & {
  website: string | null;
  /** Original import/discovery URL when different from website. */
  sourceUrl?: string | null;
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

export type CatalogCompanyClaimRequest = {
  id: number;
  companyId: number;
  companyName?: string;
  companySlug?: string;
  companyOrigin?: CatalogCompanyOrigin;
  companyProfileStatus?: CatalogCompanyProfileStatus;
  userId: string;
  status: "pending" | "approved" | "rejected";
  fullName: string;
  position: string;
  email: string;
  phone: string;
  companyWebsite: string;
  proofMethod: "domain_email" | "official_phone" | "document_screenshot" | "other";
  proofText: string;
  proofFileUrl: string;
  proofType: string;
  proofValue: string;
  message: string;
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
