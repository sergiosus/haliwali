import type { CatalogSourceOfferInput } from "./catalogSourceOfferTypes";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSourceOfferSearchFields(
  input: Pick<
    CatalogSourceOfferInput,
    | "title"
    | "shortSnippet"
    | "brand"
    | "oemCodes"
    | "articleCodes"
    | "companyName"
    | "sellerName"
    | "city"
    | "region"
    | "sourceName"
  >,
): {
  titleSearch: string;
  brandSearch: string;
  oemSearch: string;
  companySearch: string;
  citySearch: string;
} {
  const company = norm([input.companyName, input.sellerName].filter(Boolean).join(" "));
  const oem = norm([...input.oemCodes, ...input.articleCodes].join(" "));
  return {
    titleSearch: norm([input.title, input.shortSnippet].filter(Boolean).join(" ")),
    brandSearch: norm(input.brand ?? ""),
    oemSearch: oem,
    companySearch: company,
    citySearch: norm([input.city, input.region, input.sourceName].filter(Boolean).join(" ")),
  };
}
