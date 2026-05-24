import type { CatalogImportDraftInput } from "./catalogImportTypes";
import type { ExtractedCompanyDraft } from "./catalogExtractionTypes";

const NAME_SOURCE_RANK: Record<string, number> = {
  jsonld_org: 100,
  footer: 85,
  contact: 80,
  og_site: 70,
  meta_org: 65,
  branding: 55,
  og_title: 20,
  title: 10,
  domain: 5,
  fallback: 0,
};

function nameSourceRank(source: unknown): number {
  return NAME_SOURCE_RANK[String(source ?? "")] ?? 0;
}

function pickLonger(a: string, b: string): string {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta) return tb;
  if (!tb) return ta;
  return ta.length >= tb.length ? ta : tb;
}

function pickBetterName(
  a: { name: string; source?: unknown },
  b: { name: string; source?: unknown },
): { name: string; source?: unknown } {
  if (!a.name.trim()) return b;
  if (!b.name.trim()) return a;
  const ra = nameSourceRank(a.source);
  const rb = nameSourceRank(b.source);
  if (rb > ra) return b;
  if (ra > rb) return a;
  return a.name.length >= b.name.length ? a : b;
}

/** Merge two company-level extractions for the same domain. */
export function mergeExtractedCompanyDrafts(
  base: ExtractedCompanyDraft,
  extra: ExtractedCompanyDraft,
): ExtractedCompanyDraft {
  const namePick = pickBetterName(
    { name: base.name, source: base.rawPayload.nameSource },
    { name: extra.name, source: extra.rawPayload.nameSource },
  );
  const mergedUrls = [
    ...new Set([
      ...((base.rawPayload.mergedSourceUrls as string[] | undefined) ?? []),
      base.sourceUrl,
      extra.sourceUrl,
    ].filter(Boolean)),
  ];

  return {
    name: namePick.name,
    categorySlug: base.categorySlug || extra.categorySlug,
    city: base.city || extra.city,
    address: pickLonger(base.address, extra.address),
    phone: base.phone || extra.phone,
    email: base.email || extra.email,
    website: base.website || extra.website,
    description: pickLonger(base.description, extra.description),
    latitude: base.latitude ?? extra.latitude,
    longitude: base.longitude ?? extra.longitude,
    imageUrl: base.imageUrl || extra.imageUrl,
    sourceUrl: base.sourceUrl || extra.sourceUrl,
    socialLinks: [...base.socialLinks, ...extra.socialLinks].filter(
      (l, i, arr) => arr.findIndex((x) => x.url === l.url) === i,
    ),
    confidenceScore: Math.max(base.confidenceScore, extra.confidenceScore),
    rawPayload: {
      ...base.rawPayload,
      ...extra.rawPayload,
      nameSource: namePick.source ?? base.rawPayload.nameSource,
      mergedSourceUrls: mergedUrls,
      rootDomain: base.rawPayload.rootDomain ?? extra.rawPayload.rootDomain,
    },
  };
}

export function mergeDraftInputs(
  existing: CatalogImportDraftInput,
  incoming: CatalogImportDraftInput,
): Partial<CatalogImportDraftInput> {
  const namePick = pickBetterName(
    { name: existing.name, source: existing.rawPayload?.nameSource },
    { name: incoming.name, source: incoming.rawPayload?.nameSource },
  );
  return {
    name: namePick.name,
    categorySlug: existing.categorySlug || incoming.categorySlug,
    city: existing.city || incoming.city,
    address: pickLonger(existing.address, incoming.address),
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    website: existing.website || incoming.website,
    description: pickLonger(existing.description, incoming.description),
    latitude: existing.latitude ?? incoming.latitude,
    longitude: existing.longitude ?? incoming.longitude,
    imageUrl: existing.imageUrl || incoming.imageUrl,
    sourceUrl: existing.sourceUrl || incoming.sourceUrl,
    socialLinks:
      (incoming.socialLinks?.length ?? 0) > (existing.socialLinks?.length ?? 0) ?
        incoming.socialLinks
      : existing.socialLinks,
    confidenceScore: Math.max(existing.confidenceScore ?? 0, incoming.confidenceScore ?? 0),
    rawPayload: {
      ...existing.rawPayload,
      ...incoming.rawPayload,
      nameSource: namePick.source ?? existing.rawPayload?.nameSource,
    },
  };
}
