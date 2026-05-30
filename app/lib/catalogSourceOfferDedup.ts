import type { CatalogSourceOfferDraft, CatalogSourceOfferInput } from "./catalogSourceOfferTypes";

export type SourceOfferDedupHit = {
  hint: string;
  duplicateOfOfferId: number | null;
  existingDraftId?: number;
};

export type SourceOfferDedupSeed = {
  published: {
    id: number;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
    phone?: string;
    website?: string;
  }[];
  drafts: {
    id: number;
    status: string;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
    publishedOfferId: number | null;
  }[];
};

function normUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function companyKey(input: Pick<CatalogSourceOfferInput, "companyName" | "sellerName">): string {
  return normText(input.companyName || input.sellerName);
}

export function findSourceOfferDuplicate(
  seed: SourceOfferDedupSeed,
  input: CatalogSourceOfferInput,
  rawPayload?: Record<string, unknown>,
): SourceOfferDedupHit | null {
  const urlKey = normUrl(input.sourceUrl);
  if (!urlKey) return null;

  const phone = String(rawPayload?.phone ?? "").trim();
  const website = String(rawPayload?.website ?? "").trim();

  for (const p of seed.published) {
    if (normUrl(p.sourceUrl) === urlKey) {
      return { hint: "Тот же sourceUrl уже в индексе", duplicateOfOfferId: p.id };
    }
    const pk = `${normText(p.title)}|${companyKey(p)}|${normText(p.city)}`;
    const ik = `${normText(input.title)}|${companyKey(input)}|${normText(input.city)}`;
    if (pk === ik && pk.length > 8) {
      return { hint: "Тот же title + продавец + город", duplicateOfOfferId: p.id };
    }
    for (const code of [...input.oemCodes, ...input.articleCodes]) {
      const c = code.toUpperCase();
      if (
        c.length >= 4 &&
        [...p.oemCodes, ...p.articleCodes].some((x) => x.toUpperCase() === c) &&
        companyKey(p) === companyKey(input) &&
        companyKey(input)
      ) {
        return { hint: `OEM/артикул ${c} у того же продавца`, duplicateOfOfferId: p.id };
      }
    }
    if (phone && (p.phone === phone || p.website === website)) {
      return { hint: "Тот же телефон или сайт", duplicateOfOfferId: p.id };
    }
  }

  for (const d of seed.drafts) {
    if (d.status === "rejected") continue;
    if (normUrl(d.sourceUrl) === urlKey) {
      return {
        hint: "Черновик с тем же sourceUrl",
        duplicateOfOfferId: d.publishedOfferId,
        existingDraftId: d.id,
      };
    }
    const pk = `${normText(d.title)}|${companyKey(d)}|${normText(d.city)}`;
    const ik = `${normText(input.title)}|${companyKey(input)}|${normText(input.city)}`;
    if (pk === ik && pk.length > 8) {
      return {
        hint: "Черновик: title + продавец + город",
        duplicateOfOfferId: d.publishedOfferId,
        existingDraftId: d.id,
      };
    }
  }

  return null;
}

export function draftToDedupSeedRow(d: CatalogSourceOfferDraft): SourceOfferDedupSeed["drafts"][number] {
  return {
    id: d.id,
    status: d.status,
    sourceUrl: d.sourceUrl,
    title: d.title,
    companyName: d.companyName,
    sellerName: d.sellerName,
    city: d.city,
    oemCodes: d.oemCodes,
    articleCodes: d.articleCodes,
    publishedOfferId: d.publishedOfferId,
  };
}
