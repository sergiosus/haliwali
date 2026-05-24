import type { ExtractedCompanyDraft } from "./catalogExtractionTypes";
import { normPhoneKey, normWebsiteKey } from "./catalogExtractShared";

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type DedupIndexEntry = {
  companyId: number | null;
  draftId: number | null;
  kind: "published" | "draft";
};

export type DedupIndex = {
  byPhone: Map<string, DedupIndexEntry>;
  byWebsite: Map<string, DedupIndexEntry>;
  byNameCity: Map<string, DedupIndexEntry>;
  byAddressCity: Map<string, DedupIndexEntry>;
  byAddressPhone: Map<string, DedupIndexEntry>;
};

export function buildDedupIndex(
  published: {
    id: number;
    name: string;
    city: string;
    phone: string;
    website: string;
    address: string;
  }[],
  drafts: {
    id: number;
    name: string;
    city: string;
    phone: string;
    website: string;
    address: string;
  }[],
): DedupIndex {
  const index: DedupIndex = {
    byPhone: new Map(),
    byWebsite: new Map(),
    byNameCity: new Map(),
    byAddressCity: new Map(),
    byAddressPhone: new Map(),
  };

  const add = (entry: DedupIndexEntry, keys: { phone?: string; website?: string; name?: string; city?: string; address?: string }) => {
    if (keys.phone) {
      const pk = normPhoneKey(keys.phone);
      if (pk.length >= 10) index.byPhone.set(pk, entry);
    }
    if (keys.website) {
      const wk = normWebsiteKey(keys.website);
      if (wk) index.byWebsite.set(wk, entry);
    }
    if (keys.name && keys.city) {
      index.byNameCity.set(`${normText(keys.name)}|${normText(keys.city)}`, entry);
    }
    if (keys.address && keys.city) {
      index.byAddressCity.set(`${normText(keys.address)}|${normText(keys.city)}`, entry);
    }
    if (keys.address && keys.phone) {
      const pk = normPhoneKey(keys.phone);
      if (pk.length >= 10) index.byAddressPhone.set(`${normText(keys.address)}|${pk}`, entry);
    }
  };

  for (const c of published) {
    add({ companyId: c.id, draftId: null, kind: "published" }, c);
  }
  for (const d of drafts) {
    add({ companyId: null, draftId: d.id, kind: "draft" }, d);
  }

  return index;
}

export function findDuplicate(
  index: DedupIndex,
  item: Pick<ExtractedCompanyDraft, "name" | "city" | "phone" | "website" | "address">,
): { hint: string; duplicateOfCompanyId: number | null } | null {
  const pk = normPhoneKey(item.phone);
  if (pk.length >= 10) {
    const hit = index.byPhone.get(pk);
    if (hit) {
      return {
        hint: hit.kind === "published" ? "Дубликат: совпадение телефона" : "Дубликат в черновиках (телефон)",
        duplicateOfCompanyId: hit.companyId,
      };
    }
  }

  const wk = normWebsiteKey(item.website);
  if (wk) {
    const hit = index.byWebsite.get(wk);
    if (hit) {
      return {
        hint: hit.kind === "published" ? "Дубликат: совпадение сайта" : "Дубликат в черновиках (сайт)",
        duplicateOfCompanyId: hit.companyId,
      };
    }
  }

  if (item.name && item.city) {
    const hit = index.byNameCity.get(`${normText(item.name)}|${normText(item.city)}`);
    if (hit) {
      return {
        hint: hit.kind === "published" ? "Дубликат: название + город" : "Дубликат в черновиках (название)",
        duplicateOfCompanyId: hit.companyId,
      };
    }
  }

  if (item.address && item.city) {
    const hit = index.byAddressCity.get(`${normText(item.address)}|${normText(item.city)}`);
    if (hit) {
      return {
        hint: hit.kind === "published" ? "Дубликат: адрес + город" : "Дубликат в черновиках (адрес)",
        duplicateOfCompanyId: hit.companyId,
      };
    }
  }

  if (item.address && item.phone) {
    const hit = index.byAddressPhone.get(`${normText(item.address)}|${pk}`);
    if (hit) {
      return {
        hint: hit.kind === "published" ? "Дубликат: адрес + телефон" : "Дубликат в черновиках (адрес)",
        duplicateOfCompanyId: hit.companyId,
      };
    }
  }

  return null;
}

export function registerInDedupIndex(
  index: DedupIndex,
  item: Pick<ExtractedCompanyDraft, "name" | "city" | "phone" | "website" | "address">,
  draftId: number,
): void {
  const entry: DedupIndexEntry = { companyId: null, draftId, kind: "draft" };
  const pk = normPhoneKey(item.phone);
  if (pk.length >= 10) index.byPhone.set(pk, entry);
  const wk = normWebsiteKey(item.website);
  if (wk) index.byWebsite.set(wk, entry);
  if (item.name && item.city) {
    index.byNameCity.set(`${normText(item.name)}|${normText(item.city)}`, entry);
  }
  if (item.address && item.city) {
    index.byAddressCity.set(`${normText(item.address)}|${normText(item.city)}`, entry);
  }
  if (item.address && item.phone) {
    index.byAddressPhone.set(`${normText(item.address)}|${pk}`, entry);
  }
}
