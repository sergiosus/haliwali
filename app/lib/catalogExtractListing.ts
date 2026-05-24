import type { ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import type { FetchedHtml } from "./catalogHtmlFetch";
import {
  addressLikeFromText,
  computeConfidenceScore,
  emailsFromText,
  metaContent,
  normalizePhone,
  phonesFromText,
  stripTags,
  titleTag,
} from "./catalogExtractShared";

export function extractListingFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): ExtractedCompanyDraft[] {
  const html = fetched.html;
  const visible = stripTags(html).replace(/\s+/g, " ").slice(0, 12000);
  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const pageTitle = titleTag(html);

  const name = (ogTitle || pageTitle).slice(0, 200);
  const phones = phonesFromText(visible);
  const emails = emailsFromText(visible);
  const address = addressLikeFromText(visible);

  const cityMatch = visible.match(/(?:г\.|город)\s*([А-Яа-яЁё\-]{2,40})/i);
  const city = defaults.city || cityMatch?.[1]?.trim() || "";

  const draft: ExtractedCompanyDraft = {
    name,
    categorySlug: defaults.categorySlug,
    city,
    address,
    phone: phones[0] ? normalizePhone(phones[0]) : "",
    email: emails[0] ?? "",
    website: "",
    description: (ogDesc || visible).slice(0, 2000),
    latitude: null,
    longitude: null,
    imageUrl: ogImage && /^https?:\/\//i.test(ogImage) ? ogImage.slice(0, 500) : null,
    sourceUrl: fetched.url.toString(),
    socialLinks: [],
    confidenceScore: computeConfidenceScore(
      {
        name,
        phone: phones[0] ?? "",
        email: emails[0] ?? "",
        address,
        description: ogDesc,
        sourceUrl: fetched.url.toString(),
        imageUrl: ogImage,
        city,
      },
      defaults.city,
    ),
    rawPayload: { extractor: "listing", host: fetched.url.hostname },
  };

  return [draft];
}
