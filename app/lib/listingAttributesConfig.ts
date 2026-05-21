/**
 * @deprecated Import from listingAttributeSchemas / listingAttributeResolver.
 * Re-exported for backward compatibility.
 */
export type {
  ListingAttributeFieldDef,
  ListingAttributeFieldType,
  ListingAttributeSchema,
  ListingAttributeSchemaId,
  ListingAttributes,
} from "./listingAttributeSchemas";

export { LISTING_ATTRIBUTE_SCHEMAS, LISTING_ATTRIBUTE_SCHEMA_IDS } from "./listingAttributeSchemas";

export {
  CATEGORY_SLUG_TO_SCHEMA_ID,
  PRODUCT_CATEGORY_SLUG_TO_SCHEMA_ID,
  normalizeListingCategoryKey,
  getListingAttributeFieldDefs,
  getListingAttributeSchemaForSlug,
  resolveListingAttributeSchemaId,
  categorySlugsWithAttributeSchemas,
  productCategoryNamesWithSchemas,
  resolveListingAttributesParentTitle,
  LISTING_ATTRIBUTE_CONFIGS,
  REQUIRED_LISTING_ATTRIBUTE_PARENT_CATEGORIES,
  parentCategoriesWithAttributeConfigs,
} from "./listingAttributeResolver";

export { GENERIC_ATTRIBUTE_FIELDS } from "./listingAttributeSchemas";
export {
  GENERIC_SERVICE_FIELDS,
  LISTING_SERVICE_SCHEMAS,
  SERVICE_CATEGORY_NAME_TO_SCHEMA_ID,
} from "./listingServiceAttributeSchemas";
export {
  GENERIC_TASK_FIELDS,
  LISTING_TASK_SCHEMAS,
  TASK_CATEGORY_NAME_TO_SCHEMA_ID,
} from "./listingTaskAttributeSchemas";
