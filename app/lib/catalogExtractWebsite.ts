import type { CatalogSocialLink, ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import type { FetchedHtml } from "./catalogHtmlFetch";
import { computeImportConfidence, confidenceToStored } from "./catalogConfidence";
import {
  addressLikeFromText,
  emailsFromText,
  extractJsonLd,
  metaContent,
  normalizePhone,
  normalizeWebsite,
  phonesFromText,
  pickOrgNode,
  stripTags,
  str,
  titleTag,
} from "./catalogExtractShared";

function socialLinksFromHtml(html: string, baseUrl: string): CatalogSocialLink[] {
  const links: CatalogSocialLink[] = [];
  const re = /https?:\/\/(?:www\.)?(vk\.com|t\.me|telegram\.me|instagram\.com|facebook\.com|youtube\.com)[^\s"'<>]*/gi;
  const m = html.match(re) ?? [];
  for (const url of [...new Set(m)].slice(0, 8)) {
    let type: CatalogSocialLink["type"] = "other";
    if (/vk\.com/i.test(url)) type = "vk";
    else if (/t\.me|telegram/i.test(url)) type = "telegram";
    else if (/instagram/i.test(url)) type = "instagram";
    else if (/facebook/i.test(url)) type = "facebook";
    else if (/youtube/i.test(url)) type = "youtube";
    links.push({ type, url: url.slice(0, 300) });
  }
  if (links.length === 0 && /vk\.com/i.test(baseUrl)) {
    links.push({ type: "vk", url: baseUrl });
  }
  return links;
}

export function extractWebsiteFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): ExtractedCompanyDraft[] {
  const html = fetched.html;
  const url = fetched.url;
  const jsonLd = extractJsonLd(html);
  const org = pickOrgNode(jsonLd);

  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const metaDesc = metaContent(html, "description", "name");
  const pageTitle = titleTag(html);
  const visible = stripTags(html).replace(/\s+/g, " ").slice(0, 12000);

  const name =
    str(org?.name) ||
    ogTitle ||
    pageTitle.split("|")[0]?.split("—")[0]?.trim() ||
    pageTitle.slice(0, 120);

  const description =
    str(org?.description) || ogDesc || metaDesc || visible.slice(0, 500);

  const phones = phonesFromText(visible);
  const phone = normalizePhone(str(org?.telephone)) || phones[0] || "";
  const emails = emailsFromText(visible);
  const email = str(org?.email).toLowerCase() || emails[0] || "";

  let website = str(org?.url) || url.origin;
  website = normalizeWebsite(website);

  const addr = org?.address;
  let address = addressLikeFromText(visible);
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    address =
      [str(a.streetAddress), str(a.addressLocality), str(a.postalCode)].filter(Boolean).join(", ") ||
      address;
  }

  const imageUrl = str(org?.image) || str(org?.logo) || ogImage || null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  const geo = org?.geo;
  if (geo && typeof geo === "object") {
    const g = geo as Record<string, unknown>;
    const lat = Number(g.latitude);
    const lng = Number(g.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      latitude = lat;
      longitude = lng;
    }
  }

  const city =
    defaults.city ||
    str((addr as Record<string, unknown> | undefined)?.addressLocality) ||
    "";

  const draft: ExtractedCompanyDraft = {
    name: name.slice(0, 200),
    categorySlug: defaults.categorySlug,
    city,
    address: address.slice(0, 300),
    phone,
    email,
    website,
    description: description.slice(0, 2000),
    latitude,
    longitude,
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 500) : null,
    sourceUrl: url.toString(),
    socialLinks: socialLinksFromHtml(html, url.toString()),
    confidenceScore: confidenceToStored(
      computeImportConfidence({
        name,
        phone,
        address,
        website,
        description,
        imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
        city,
        targetCity: defaults.city,
      }) + (org ? 5 : 0),
    ),
    rawPayload: {
      extractor: "website",
      title: pageTitle.slice(0, 200),
      hasJsonLd: Boolean(org),
      byteLength: fetched.byteLength,
    },
  };

  return [draft];
}
