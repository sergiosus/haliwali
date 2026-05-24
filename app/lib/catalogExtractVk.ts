import type { CatalogSocialLink, ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
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

export function extractVkFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): ExtractedCompanyDraft[] {
  const html = fetched.html;
  const visible = stripTags(html).replace(/\s+/g, " ").slice(0, 10000);
  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const pageTitle = titleTag(html);

  const name = (ogTitle || pageTitle).replace(/\s*\|\s*VK.*$/i, "").trim().slice(0, 200);
  const phones = phonesFromText(visible);
  const emails = emailsFromText(visible);
  const address = addressLikeFromText(visible);

  const socialLinks: CatalogSocialLink[] = [{ type: "vk", url: fetched.url.toString() }];

  const draft: ExtractedCompanyDraft = {
    name,
    categorySlug: defaults.categorySlug,
    city: defaults.city,
    address,
    phone: phones[0] ? normalizePhone(phones[0]) : "",
    email: emails[0] ?? "",
    website: "",
    description: (ogDesc || visible).slice(0, 2000),
    latitude: null,
    longitude: null,
    imageUrl: ogImage && /^https?:\/\//i.test(ogImage) ? ogImage.slice(0, 500) : null,
    sourceUrl: fetched.url.toString(),
    socialLinks,
    confidenceScore: computeConfidenceScore(
      {
        name,
        phone: phones[0] ?? "",
        email: emails[0] ?? "",
        address,
        description: ogDesc,
        sourceUrl: fetched.url.toString(),
        imageUrl: ogImage,
        city: defaults.city,
      },
      defaults.city,
    ),
    rawPayload: { extractor: "vk", byteLength: fetched.byteLength },
  };

  return [draft];
}

export function extractVkFromPastedText(
  text: string,
  defaults: ExtractionDefaults,
  sourceUrl: string | null,
): ExtractedCompanyDraft[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blob = lines.join("\n");
  const phones = phonesFromText(blob);
  const emails = emailsFromText(blob);
  const vkUrl = blob.match(/https?:\/\/(?:www\.)?vk\.com\/[^\s]+/i)?.[0] ?? sourceUrl ?? "";
  const name = lines.find((l) => l.length > 2 && !/^https?:\/\//i.test(l) && !phonesFromText(l).length)?.slice(0, 200) ?? "";

  return [
    {
      name,
      categorySlug: defaults.categorySlug,
      city: defaults.city,
      address: addressLikeFromText(blob),
      phone: phones[0] ? normalizePhone(phones[0]) : "",
      email: emails[0] ?? "",
      website: "",
      description: lines.slice(1).join(" ").slice(0, 2000),
      latitude: null,
      longitude: null,
      imageUrl: null,
      sourceUrl: vkUrl || sourceUrl || "",
      socialLinks: vkUrl ? [{ type: "vk", url: vkUrl }] : [],
      confidenceScore: computeConfidenceScore(
        {
          name,
          phone: phones[0] ?? "",
          email: emails[0] ?? "",
          address: addressLikeFromText(blob),
          description: blob,
          sourceUrl: vkUrl,
          city: defaults.city,
        },
        defaults.city,
      ),
      rawPayload: { extractor: "vk", pasted: true },
    },
  ];
}
