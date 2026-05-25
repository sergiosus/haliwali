import type { CatalogSocialLink, ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import type { FetchedHtml } from "./catalogHtmlFetch";
import { computeImportConfidence, confidenceToStored } from "./catalogConfidence";
import { pickCompanyNameFromHtml, sanitizeExtractedCompanyName } from "./catalogCompanyNameExtract";
import { domainSiteUrl, normalizeImportDomain } from "./catalogImportDomain";
import {
  addressLikeFromText,
  emailsFromText,
  extractJsonLd,
  metaContent,
  normalizePhone,
  phonesFromText,
  pickOrgNode,
  stripTags,
  str,
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

/** Company-level contact slice: footer + contact blocks only (not product/catalog body). */
function companyContactText(html: string): string {
  const parts: string[] = [];
  const footer = html.slice(-20000);
  parts.push(stripTags(footer));
  const blocks = html.matchAll(
    /<(?:section|div|footer)[^>]*(?:id|class)=["'][^"']*(?:contact|контакт|footer|requisites|реквизит)[^"']*["'][^>]*>([\s\S]{0,15000})<\/(?:section|div|footer)>/gi,
  );
  for (const m of blocks) {
    parts.push(stripTags(m[1] ?? ""));
  }
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 8000);
}

export function extractWebsiteFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): ExtractedCompanyDraft[] {
  const html = fetched.html;
  const url = fetched.url;
  const rootDomain = normalizeImportDomain(url.toString());
  const jsonLd = extractJsonLd(html);
  const org = pickOrgNode(jsonLd);

  const ogDesc = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const metaDesc = metaContent(html, "description", "name");

  const { name: extractedName, nameSource } = pickCompanyNameFromHtml(html, { pageUrl: url.toString() });
  const website = domainSiteUrl(rootDomain);
  const name = sanitizeExtractedCompanyName(extractedName, website, rootDomain);

  const description = (str(org?.description) || ogDesc || metaDesc).slice(0, 2000);

  const contactText = companyContactText(html);
  const phones = phonesFromText(contactText);
  const phone = normalizePhone(str(org?.telephone)) || phones[0] || "";
  const emails = emailsFromText(contactText);
  const email = str(org?.email).toLowerCase() || emails[0] || "";

  const addr = org?.address;
  let address = "";
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    address = [str(a.streetAddress), str(a.addressLocality), str(a.postalCode)].filter(Boolean).join(", ");
  }
  if (!address) {
    address = addressLikeFromText(contactText).slice(0, 300);
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
    description,
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
      extractionLevel: "domain",
      rootDomain,
      hasJsonLd: Boolean(org),
      nameSource,
      originalExtractedName: extractedName.slice(0, 200),
      nameSanitized: name !== extractedName.trim(),
      byteLength: fetched.byteLength,
    },
  };

  return [draft];
}
