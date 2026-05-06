import path from "node:path";

/**
 * @deprecated Legacy ads.json path. Runtime listing storage uses PostgreSQL
 * (when `DATABASE_URL` is set) or `.data/listings.json` via `serverListingsJson`.
 */
export const ADS_JSON_PATH = path.join(process.cwd(), ".data", "ads.json");

export { normalizeListingId, isPublicModerationStatus, countSellerActiveListings } from "./serverListingsStore";
