import type { CatalogCompanyListItem } from "./catalogTypes";
import { hasCatalogCoordinates } from "./catalogMapLinks";
import type { Listing } from "./listingModel";
import { listingCoordinatesForMap } from "./searchScopeLocation";

export function listingHasSeoMapButton(listing: Listing): boolean {
  return listingCoordinatesForMap(listing) != null;
}

export function companyHasSeoMapButton(company: CatalogCompanyListItem): boolean {
  return hasCatalogCoordinates(company);
}
