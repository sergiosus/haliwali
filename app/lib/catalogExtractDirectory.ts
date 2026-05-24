import type { ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import type { FetchedHtml } from "./catalogHtmlFetch";
import {
  computeConfidenceScore,
  decodeHtmlEntities,
  emailsFromText,
  normalizePhone,
  normalizeWebsite,
  phonesFromText,
  stripTags,
} from "./catalogExtractShared";

function extractCardBlocks(html: string): string[] {
  const blocks: string[] = [];
  const patterns = [
    /<article[^>]*class=["'][^"']*(?:card|item|company|org|listing)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi,
    /<div[^>]*class=["'][^"']*(?:card|company-card|org-card|catalog-item)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    /<li[^>]*class=["'][^"']*(?:company|org|item)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const block = m[1]!;
      if (block.length > 80 && block.length < 8000) blocks.push(block);
    }
    if (blocks.length >= 3) break;
  }
  return blocks.slice(0, 30);
}

function nameFromBlock(block: string): string {
  const h = block.match(/<h[1-4][^>]*>([^<]{2,120})<\/h[1-4]>/i);
  if (h?.[1]) return decodeHtmlEntities(h[1].trim());
  const link = block.match(/<a[^>]+href=["'][^"']+["'][^>]*>([^<]{2,100})<\/a>/i);
  if (link?.[1]) return decodeHtmlEntities(link[1].trim());
  const text = stripTags(block).trim();
  return text.split(/\s{2,}/)[0]?.slice(0, 120) ?? "";
}

export function extractDirectoryFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): ExtractedCompanyDraft[] {
  const blocks = extractCardBlocks(fetched.html);
  if (blocks.length < 2) {
    return [];
  }

  const drafts: ExtractedCompanyDraft[] = [];
  for (const block of blocks) {
    const visible = stripTags(block);
    const name = nameFromBlock(block);
    if (!name || name.length < 2) continue;
    const phones = phonesFromText(visible);
    const emails = emailsFromText(visible);
    const websiteMatch = block.match(/href=["'](https?:\/\/[^"']+)["']/i);
    const website = websiteMatch?.[1] ? normalizeWebsite(websiteMatch[1]) : "";

    drafts.push({
      name: name.slice(0, 200),
      categorySlug: defaults.categorySlug,
      city: defaults.city,
      address: "",
      phone: phones[0] ?? "",
      email: emails[0] ?? "",
      website,
      description: visible.slice(0, 400),
      latitude: null,
      longitude: null,
      imageUrl: null,
      sourceUrl: fetched.url.toString(),
      socialLinks: [],
      confidenceScore: computeConfidenceScore(
        {
          name,
          phone: phones[0] ?? "",
          email: emails[0] ?? "",
          address: "",
          description: visible,
          sourceUrl: fetched.url.toString(),
          website,
          city: defaults.city,
        },
        defaults.city,
      ),
      rawPayload: { extractor: "directory", cardIndex: drafts.length },
    });
  }
  return drafts;
}
