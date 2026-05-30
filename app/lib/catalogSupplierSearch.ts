import type { CatalogCompanyListItem } from "./catalogTypes";
import type { CatalogSourceOffer } from "./catalogSourceOfferTypes";
import { listPublishedSourceOffers } from "./serverCatalogSourceOfferStore";
import { searchCatalogCompanies } from "./serverCatalogStore";

export type CatalogSupplierSearchQuery = {
  q: string;
  city?: string;
  categorySlug?: string;
  limit?: number;
};

export type CatalogSupplierSearchResult = {
  companies: CatalogCompanyListItem[];
  sourceOffers: CatalogSourceOffer[];
};

/** Global supplier search: companies + indexed source offers (OEM/brand/title/snippet). */
export async function searchCatalogSuppliers(
  opts: CatalogSupplierSearchQuery,
): Promise<CatalogSupplierSearchResult> {
  const q = opts.q.trim();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 48);
  if (q.length < 2) {
    return { companies: [], sourceOffers: [] };
  }

  const [companies, sourceOffers] = await Promise.all([
    searchCatalogCompanies({
      q,
      city: opts.city,
      categorySlug: opts.categorySlug,
      limit,
    }),
    listPublishedSourceOffers({
      q,
      city: opts.city,
      categorySlug: opts.categorySlug,
      limit: limit + 12,
    }),
  ]);

  const oemLike = /[a-z0-9]{4,}/i.test(q) && /\d/.test(q);
  const sortedOffers = oemLike ?
    [...sourceOffers].sort((a, b) => {
      const qn = q.toLowerCase();
      const score = (o: (typeof sourceOffers)[0]) => {
        let s = 0;
        if (o.oemSearch.includes(qn)) s += 4;
        if (o.brandSearch.includes(qn)) s += 2;
        if (o.titleSearch.includes(qn)) s += 1;
        return s;
      };
      return score(b) - score(a);
    })
  : sourceOffers;

  return {
    companies,
    sourceOffers: sortedOffers.slice(0, limit),
  };
}
