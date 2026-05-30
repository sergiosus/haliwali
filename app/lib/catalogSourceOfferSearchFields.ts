import type { CatalogSourceOfferInput } from "./catalogSourceOfferTypes";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSourceOfferSearchFields(
  input: Pick<
    CatalogSourceOfferInput,
    "title" | "brand" | "oemCodes" | "articleCodes" | "companyName" | "sellerName" | "city" | "region"
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
    titleSearch: norm(input.title),
    brandSearch: norm(input.brand ?? ""),
    oemSearch: oem,
    companySearch: company,
    citySearch: norm([input.city, input.region].filter(Boolean).join(" ")),
  };
}
