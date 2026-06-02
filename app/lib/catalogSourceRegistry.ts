/**
 * Central registry for external offer sources (search, import, public filters).
 */

import type { CatalogSourceName, OfferListingSourceId } from "./catalogSourceOfferTypes";
import { CATALOG_SOURCE_NAME_LABEL } from "./catalogSourceName";

export type CatalogSourceRegistryStatus = "active" | "experimental" | "disabled" | "future";

export type CatalogSourceRegistryId =
  | CatalogSourceName
  | "all_active"
  | "all_sources_future";

export type CatalogSourceRegistryEntry = {
  id: CatalogSourceRegistryId;
  label: string;
  status: CatalogSourceRegistryStatus;
  supportsSearch: boolean;
  supportsImportByUrl: boolean;
  supportsImages: boolean;
  note?: string;
  disabledReason?: string;
};

const REGISTRY: CatalogSourceRegistryEntry[] = [
  {
    id: "avito",
    label: CATALOG_SOURCE_NAME_LABEL.avito,
    status: "active",
    supportsSearch: true,
    supportsImportByUrl: true,
    supportsImages: true,
  },
  {
    id: "auto_ru",
    label: CATALOG_SOURCE_NAME_LABEL.auto_ru,
    status: "experimental",
    supportsSearch: false,
    supportsImportByUrl: false,
    supportsImages: true,
    note: "Auto.ru experimental — parser not implemented yet",
    disabledReason: "parser_not_implemented",
  },
  {
    id: "drom",
    label: CATALOG_SOURCE_NAME_LABEL.drom,
    status: "experimental",
    supportsSearch: true,
    supportsImportByUrl: true,
    supportsImages: true,
    note: "Drom — экспериментальный fallback",
  },
  {
    id: "youla",
    label: CATALOG_SOURCE_NAME_LABEL.youla,
    status: "disabled",
    supportsSearch: false,
    supportsImportByUrl: false,
    supportsImages: false,
    disabledReason: "captcha",
    note: "Youla blocked by captcha (источник отключён).",
  },
  {
    id: "vk",
    label: CATALOG_SOURCE_NAME_LABEL.vk,
    status: "disabled",
    supportsSearch: false,
    supportsImportByUrl: false,
    supportsImages: false,
    disabledReason: "parser_not_implemented",
    note: "VK parser not implemented yet",
  },
  {
    id: "company_site",
    label: CATALOG_SOURCE_NAME_LABEL.company_site,
    status: "future",
    supportsSearch: false,
    supportsImportByUrl: true,
    supportsImages: true,
    note: "Сайты компаний — позже",
  },
  {
    id: "other",
    label: CATALOG_SOURCE_NAME_LABEL.other,
    status: "future",
    supportsSearch: false,
    supportsImportByUrl: true,
    supportsImages: false,
    note: "Прочие источники — позже",
  },
  {
    id: "all_active",
    label: "Все активные источники",
    status: "active",
    supportsSearch: true,
    supportsImportByUrl: true,
    supportsImages: true,
    note: "Avito и другие активные площадки",
  },
  {
    id: "all_sources_future",
    label: "Все площадки (позже)",
    status: "future",
    supportsSearch: false,
    supportsImportByUrl: false,
    supportsImages: false,
    note: "Будет включать подключённые источники после настройки парсеров.",
  },
];

export function listCatalogSourceRegistry(): readonly CatalogSourceRegistryEntry[] {
  return REGISTRY;
}

export function getCatalogSourceRegistryEntry(
  id: string,
): CatalogSourceRegistryEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}

export function isMarketplaceRegistryId(id: string): id is CatalogSourceName {
  return (
    id === "avito" ||
    id === "auto_ru" ||
    id === "drom" ||
    id === "youla" ||
    id === "vk"
  );
}

/** Sources that may be searched when explicitly enabled in admin UI. */
export function adminSearchableMarketplaceIds(): OfferListingSourceId[] {
  return REGISTRY.filter(
    (e) => isMarketplaceRegistryId(e.id) && (e.status === "active" || e.status === "experimental"),
  ).map((e) => e.id as OfferListingSourceId);
}

/** Default admin search: Avito only. */
export function defaultAdminSearchSourceIds(): OfferListingSourceId[] {
  return ["avito"];
}

/** Active marketplace sources for «all active» checkbox. */
export function activeSearchMarketplaceIds(): OfferListingSourceId[] {
  return REGISTRY.filter(
    (e) => isMarketplaceRegistryId(e.id) && e.status === "active" && e.supportsSearch,
  ).map((e) => e.id as OfferListingSourceId);
}

export function resolveAdminSearchSources(
  selected: readonly (CatalogSourceName | OfferListingSourceId)[],
): OfferListingSourceId[] {
  const uniq = new Set<OfferListingSourceId>();
  for (const raw of selected) {
    if (!isMarketplaceRegistryId(raw)) continue;
    const id = raw as OfferListingSourceId;
    const entry = getCatalogSourceRegistryEntry(id);
    if (!entry || entry.status === "disabled" || entry.status === "future") continue;
    if (entry.id === "all_sources_future" || entry.id === "all_active") continue;
    if (!entry.supportsSearch && entry.status !== "experimental") continue;
    uniq.add(id);
  }
  return [...uniq];
}

/** Per-source admin/search diagnostic text — never reuse VK message for other sources. */
export function catalogSourceDiagnosticMessage(
  source: CatalogSourceName,
  opts: { linksExtracted?: number; zeroReason?: string | null } = {},
): string {
  const entry = getCatalogSourceRegistryEntry(source);
  const links = opts.linksExtracted ?? 0;
  const zero = opts.zeroReason ?? null;

  switch (source) {
    case "avito":
      return links > 0 ? "" : "Avito: нет ссылок на объявления в HTML выдачи";
    case "auto_ru":
      if (!entry?.supportsSearch && links === 0) {
        return entry?.note ?? "Auto.ru experimental — parser not implemented yet";
      }
      if (links === 0) {
        return zero === "no_selector" ?
            "Auto.ru experimental — parser not implemented yet (нет карточек в выдаче)"
          : (entry?.note ?? "Auto.ru experimental — parser not implemented yet");
      }
      return "Auto.ru experimental — карточки только из поиска";
    case "drom":
      if (links === 0) {
        return entry?.note ?? "Drom — экспериментальный fallback";
      }
      return "Drom — экспериментальный fallback";
    case "youla":
      return entry?.note ?? "Youla blocked by captcha (источник отключён).";
    case "vk":
      return entry?.note ?? "VK parser not implemented yet";
    default:
      return entry?.note ?? "";
  }
}

export function registryDiagnosticForSource(
  source: CatalogSourceName,
  linksExtracted: number,
): string | null {
  const msg = catalogSourceDiagnosticMessage(source, { linksExtracted });
  return msg || null;
}

/** Public catalog source filter options (excludes disabled unless needed later). */
export function publicSourceFilterOptions(): { value: "" | CatalogSourceName; label: string }[] {
  return [
    { value: "", label: "Все источники" },
    { value: "avito", label: CATALOG_SOURCE_NAME_LABEL.avito },
    { value: "auto_ru", label: CATALOG_SOURCE_NAME_LABEL.auto_ru },
    { value: "drom", label: CATALOG_SOURCE_NAME_LABEL.drom },
    { value: "company_site", label: CATALOG_SOURCE_NAME_LABEL.company_site },
    { value: "other", label: CATALOG_SOURCE_NAME_LABEL.other },
  ];
}
