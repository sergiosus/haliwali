import type { CatalogImportDraftInput } from "./catalogImportTypes";
import { extractFromUrl } from "./catalogExtractionService";

/** @deprecated Use catalogExtractionService.extractFromUrl */
export async function parseCatalogPublicWebsite(
  rawUrl: string,
  defaults: { categorySlug: string; city: string },
): Promise<CatalogImportDraftInput> {
  const { drafts } = await extractFromUrl(rawUrl, defaults);
  const d = drafts[0];
  if (!d) throw new Error("EMPTY_RESULT");
  return {
    name: d.name,
    categorySlug: d.categorySlug,
    city: d.city,
    address: d.address,
    phone: d.phone,
    email: d.email,
    website: d.website,
    description: d.description,
    latitude: d.latitude,
    longitude: d.longitude,
    imageUrl: d.imageUrl,
    sourceUrl: d.sourceUrl,
    socialLinks: d.socialLinks,
    confidenceScore: d.confidenceScore,
    rawPayload: d.rawPayload,
  };
}
