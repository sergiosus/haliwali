/**
 * Exact category slug / normalized name → attribute schema lookup.
 * No parent fallback, no fuzzy matching, no category.includes().
 */

import {
  categoryToSlug,
  homeCategoryGridSections,
  productCategories,
  serviceCategories,
  taskCategories,
} from "./categories";
import type { ListingType } from "./listingModel";
import {
  GENERIC_ATTRIBUTE_FIELDS,
  LISTING_ATTRIBUTE_SCHEMAS,
  type ListingAttributeFieldDef,
  type ListingAttributeSchemaId,
} from "./listingAttributeSchemas";
import {
  GENERIC_SERVICE_FIELDS,
  LISTING_SERVICE_SCHEMAS,
  SERVICE_CATEGORY_NAME_TO_SCHEMA_ID,
  type ListingServiceSchemaId,
} from "./listingServiceAttributeSchemas";
import {
  GENERIC_TASK_FIELDS,
  LISTING_TASK_SCHEMAS,
  TASK_CATEGORY_NAME_TO_SCHEMA_ID,
  type ListingTaskSchemaId,
} from "./listingTaskAttributeSchemas";

/** Normalize category label or slug key: trim + lower-case (ru). */
export function normalizeListingCategoryKey(value: string): string {
  return (value ?? "").trim().toLocaleLowerCase("ru");
}

/** Product leaf slug → schema id (explicit; no fuzzy logic). */
export const PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID: Readonly<Record<string, ListingAttributeSchemaId>> = {
  "tovary-avtomobili": "automobiles",
  "tovary-moto": "motorcycles",
  "tovary-velosipedy": "bicycles",
  "tovary-spetstehnika": "special_vehicles",
  "tovary-zapchasti": "auto_parts",
  "tovary-shiny": "tires",
  "tovary-diski": "wheels",
  "tovary-akkumulyatory": "batteries",
  "tovary-kvartiry": "apartments",
  "tovary-doma": "houses",
  "tovary-uchastki": "land_plots",
  "tovary-garazhi": "garages",
  "tovary-telefony": "phones",
  "tovary-kompyutery": "computers",
  "tovary-noutbuki": "computers",
  "tovary-tehnika": "appliances",
  "tovary-mebel": "generic",
  "tovary-tovary-dlya-doma": "generic",
  "tovary-instrumenty": "generic",
  "tovary-odezhda": "clothing",
  "tovary-obuv": "clothing",
  "tovary-sumki": "generic",
  "tovary-ukrasheniya": "generic",
  "tovary-igrushki": "generic",
  "tovary-kolyaski": "strollers",
  "tovary-detskaya-odezhda": "children_clothing",
  "tovary-oborudovanie": "business_equipment",
  "tovary-stanki": "business_equipment",
  "tovary-tovary-dlya-biznesa": "generic",
  "tovary-sport": "generic",
  "tovary-knigi": "generic",
  "tovary-muzika": "generic",
  "tovary-turizm": "generic",
  "tovary-sobaki": "pets_dogs",
  "tovary-koshki": "pets_cats",
  "tovary-ptitsy": "pets_birds",
  "tovary-gryzuny": "pets_rodents",
  "tovary-reptilii": "pets_reptiles",
  "tovary-akvariumistika": "pets_supplies",
  "tovary-tovary-dlya-zhivotnyh": "pets_supplies",
  "tovary-drugoe": "generic",
};

function productFieldsForSchemaId(schemaId: ListingAttributeSchemaId): readonly ListingAttributeFieldDef[] {
  return LISTING_ATTRIBUTE_SCHEMAS[schemaId].fields;
}

function serviceFieldsForSchemaId(schemaId: ListingServiceSchemaId): readonly ListingAttributeFieldDef[] {
  return LISTING_SERVICE_SCHEMAS[schemaId].fields;
}

function taskFieldsForSchemaId(schemaId: ListingTaskSchemaId): readonly ListingAttributeFieldDef[] {
  return LISTING_TASK_SCHEMAS[schemaId].fields;
}

const PRODUCT_SCHEMA_BY_SLUG = new Map<string, ListingAttributeSchemaId>();
const PRODUCT_SCHEMA_BY_NAME = new Map<string, ListingAttributeSchemaId>();
const PRODUCT_FIELDS_BY_SLUG = new Map<string, readonly ListingAttributeFieldDef[]>();
const PRODUCT_FIELDS_BY_NAME = new Map<string, readonly ListingAttributeFieldDef[]>();

const SERVICE_SCHEMA_BY_SLUG = new Map<string, ListingServiceSchemaId>();
const SERVICE_SCHEMA_BY_NAME = new Map<string, ListingServiceSchemaId>();
const SERVICE_FIELDS_BY_SLUG = new Map<string, readonly ListingAttributeFieldDef[]>();
const SERVICE_FIELDS_BY_NAME = new Map<string, readonly ListingAttributeFieldDef[]>();

const TASK_SCHEMA_BY_SLUG = new Map<string, ListingTaskSchemaId>();
const TASK_SCHEMA_BY_NAME = new Map<string, ListingTaskSchemaId>();
const TASK_FIELDS_BY_SLUG = new Map<string, readonly ListingAttributeFieldDef[]>();
const TASK_FIELDS_BY_NAME = new Map<string, readonly ListingAttributeFieldDef[]>();

function registerProduct(slug: string, name: string, schemaId: ListingAttributeSchemaId): void {
  const s = slug.trim();
  const key = normalizeListingCategoryKey(name);
  const fields = productFieldsForSchemaId(schemaId);
  if (s) {
    PRODUCT_SCHEMA_BY_SLUG.set(s, schemaId);
    PRODUCT_FIELDS_BY_SLUG.set(s, fields);
  }
  if (key) {
    PRODUCT_SCHEMA_BY_NAME.set(key, schemaId);
    PRODUCT_FIELDS_BY_NAME.set(key, fields);
  }
}

function registerService(slug: string, name: string, schemaId: ListingServiceSchemaId): void {
  const s = slug.trim();
  const key = normalizeListingCategoryKey(name);
  const fields = serviceFieldsForSchemaId(schemaId);
  if (s) {
    SERVICE_SCHEMA_BY_SLUG.set(s, schemaId);
    SERVICE_FIELDS_BY_SLUG.set(s, fields);
  }
  if (key) {
    SERVICE_SCHEMA_BY_NAME.set(key, schemaId);
    SERVICE_FIELDS_BY_NAME.set(key, fields);
  }
}

function registerTask(slug: string, name: string, schemaId: ListingTaskSchemaId): void {
  const s = slug.trim();
  const key = normalizeListingCategoryKey(name);
  const fields = taskFieldsForSchemaId(schemaId);
  if (s) {
    TASK_SCHEMA_BY_SLUG.set(s, schemaId);
    TASK_FIELDS_BY_SLUG.set(s, fields);
  }
  if (key) {
    TASK_SCHEMA_BY_NAME.set(key, schemaId);
    TASK_FIELDS_BY_NAME.set(key, fields);
  }
}

for (const [slug, schemaId] of Object.entries(PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID)) {
  registerProduct(slug, "", schemaId);
}

for (const name of productCategories) {
  const slug = categoryToSlug(name, "product_sell");
  const schemaId = PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID[slug] ?? "generic";
  registerProduct(slug, name, schemaId);
}

for (const name of serviceCategories) {
  const slug = categoryToSlug(name, "service");
  const nameKey = normalizeListingCategoryKey(name);
  const schemaId = SERVICE_CATEGORY_NAME_TO_SCHEMA_ID[nameKey] ?? "service_generic";
  registerService(slug, name, schemaId);
}

for (const name of taskCategories) {
  const slug = categoryToSlug(name, "task");
  const nameKey = normalizeListingCategoryKey(name);
  const schemaId = TASK_CATEGORY_NAME_TO_SCHEMA_ID[nameKey] ?? "task_generic";
  registerTask(slug, name, schemaId);
}

for (const section of homeCategoryGridSections) {
  const isProductColumn = section.heading === "Товары";
  const isServiceColumn = section.heading === "Услуги";
  const isTaskColumn = section.heading === "Задачи";
  for (const group of section.groups) {
    for (const link of group.links) {
      const slug = link.slug.trim();
      if (!slug) continue;
      const label = link.label.trim();
      if (isProductColumn) {
        if (!PRODUCT_FIELDS_BY_SLUG.has(slug)) {
          const schemaId = PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID[slug] ?? "generic";
          registerProduct(slug, label, schemaId);
        }
      } else if (isServiceColumn) {
        const nameKey = normalizeListingCategoryKey(label);
        const schemaId = SERVICE_CATEGORY_NAME_TO_SCHEMA_ID[nameKey] ?? "service_generic";
        registerService(slug, label, schemaId);
      } else if (isTaskColumn) {
        const nameKey = normalizeListingCategoryKey(label);
        const schemaId = TASK_CATEGORY_NAME_TO_SCHEMA_ID[nameKey] ?? "task_generic";
        registerTask(slug, label, schemaId);
      }
    }
  }
}

const productGenericFields = GENERIC_ATTRIBUTE_FIELDS;
const serviceGenericFields = GENERIC_SERVICE_FIELDS;
const taskGenericFields = GENERIC_TASK_FIELDS;

/** @deprecated Alias for PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID */
export const CATEGORY_SLUG_TO_SCHEMA_ID = PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID;

function resolveProductFields(slug: string, nameKey: string): readonly ListingAttributeFieldDef[] {
  if (slug && PRODUCT_FIELDS_BY_SLUG.has(slug)) return PRODUCT_FIELDS_BY_SLUG.get(slug)!;
  if (nameKey && PRODUCT_FIELDS_BY_NAME.has(nameKey)) return PRODUCT_FIELDS_BY_NAME.get(nameKey)!;
  if (slug || nameKey) return productGenericFields;
  return [];
}

function resolveServiceFields(slug: string, nameKey: string): readonly ListingAttributeFieldDef[] {
  if (slug && SERVICE_FIELDS_BY_SLUG.has(slug)) return SERVICE_FIELDS_BY_SLUG.get(slug)!;
  if (nameKey && SERVICE_FIELDS_BY_NAME.has(nameKey)) return SERVICE_FIELDS_BY_NAME.get(nameKey)!;
  if (slug || nameKey) return serviceGenericFields;
  return [];
}

function resolveTaskFields(slug: string, nameKey: string): readonly ListingAttributeFieldDef[] {
  if (slug && TASK_FIELDS_BY_SLUG.has(slug)) return TASK_FIELDS_BY_SLUG.get(slug)!;
  if (nameKey && TASK_FIELDS_BY_NAME.has(nameKey)) return TASK_FIELDS_BY_NAME.get(nameKey)!;
  if (slug || nameKey) return taskGenericFields;
  return [];
}

export type ListingAttributeSchemaIdResolved =
  | ListingAttributeSchemaId
  | ListingServiceSchemaId
  | ListingTaskSchemaId;

/** Resolve schema id from exact slug or normalized category name. */
export function resolveListingAttributeSchemaId(
  categoryName: string,
  categorySlug: string,
  listingType?: ListingType,
): ListingAttributeSchemaIdResolved | null {
  const slug = (categorySlug ?? "").trim();
  const nameKey = normalizeListingCategoryKey(categoryName);

  if (listingType === "service") {
    if (slug && SERVICE_SCHEMA_BY_SLUG.has(slug)) return SERVICE_SCHEMA_BY_SLUG.get(slug)!;
    if (nameKey && SERVICE_SCHEMA_BY_NAME.has(nameKey)) return SERVICE_SCHEMA_BY_NAME.get(nameKey)!;
    if (slug || nameKey) return "service_generic";
    return null;
  }

  if (listingType === "product_sell" || listingType === "product_buy") {
    if (slug && PRODUCT_SCHEMA_BY_SLUG.has(slug)) return PRODUCT_SCHEMA_BY_SLUG.get(slug)!;
    if (nameKey && PRODUCT_SCHEMA_BY_NAME.has(nameKey)) return PRODUCT_SCHEMA_BY_NAME.get(nameKey)!;
    if (slug || nameKey) return "generic";
    return null;
  }

  if (listingType === "task") {
    if (slug && TASK_SCHEMA_BY_SLUG.has(slug)) return TASK_SCHEMA_BY_SLUG.get(slug)!;
    if (nameKey && TASK_SCHEMA_BY_NAME.has(nameKey)) return TASK_SCHEMA_BY_NAME.get(nameKey)!;
    if (slug || nameKey) return "task_generic";
    return null;
  }

  return null;
}

/** Field definitions — exact slug/name; product vs service vs task registries. */
export function getListingAttributeFieldDefs(
  categoryName: string,
  categorySlug: string,
  listingType: ListingType,
): readonly ListingAttributeFieldDef[] {
  const slug = (categorySlug ?? "").trim();
  const nameKey = normalizeListingCategoryKey(categoryName);

  if (listingType === "service") {
    return resolveServiceFields(slug, nameKey);
  }
  if (listingType === "product_sell" || listingType === "product_buy") {
    return resolveProductFields(slug, nameKey);
  }
  if (listingType === "task") {
    return resolveTaskFields(slug, nameKey);
  }
  return [];
}

export function getListingAttributeSchemaForSlug(categorySlug: string, listingType?: ListingType) {
  const id = resolveListingAttributeSchemaId("", categorySlug, listingType);
  if (!id) return null;
  if (typeof id === "string" && id.startsWith("service_")) {
    return LISTING_SERVICE_SCHEMAS[id as ListingServiceSchemaId];
  }
  if (typeof id === "string" && id.startsWith("task_")) {
    return LISTING_TASK_SCHEMAS[id as ListingTaskSchemaId];
  }
  return LISTING_ATTRIBUTE_SCHEMAS[id as ListingAttributeSchemaId];
}

export function categorySlugsWithAttributeSchemas(): string[] {
  return [...new Set([...PRODUCT_FIELDS_BY_SLUG.keys(), ...SERVICE_FIELDS_BY_SLUG.keys(), ...TASK_FIELDS_BY_SLUG.keys()])].sort(
    (a, b) => a.localeCompare(b, "ru"),
  );
}

export function productCategoryNamesWithSchemas(): string[] {
  return [...PRODUCT_FIELDS_BY_NAME.keys()].sort((a, b) => a.localeCompare(b, "ru"));
}

export function serviceCategoryNamesWithSchemas(): string[] {
  return [...SERVICE_FIELDS_BY_NAME.keys()].sort((a, b) => a.localeCompare(b, "ru"));
}

export function taskCategoryNamesWithSchemas(): string[] {
  return [...TASK_FIELDS_BY_NAME.keys()].sort((a, b) => a.localeCompare(b, "ru"));
}

/** @deprecated */
export function resolveListingAttributesParentTitle(
  _categoryName: string,
  _categorySlug: string,
  _listingType: ListingType,
): string | null {
  return null;
}

/** @deprecated */
export const LISTING_ATTRIBUTE_CONFIGS = [] as const;

/** @deprecated */
export const REQUIRED_LISTING_ATTRIBUTE_PARENT_CATEGORIES = [] as const;

/** @deprecated */
export function parentCategoriesWithAttributeConfigs(): string[] {
  return categorySlugsWithAttributeSchemas();
}
