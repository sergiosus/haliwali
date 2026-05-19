import fs from "fs/promises";
import path from "path";
import { getPool, usesPostgres } from "./pgPool";
import { isSearchAnalyticsEnabled } from "./searchFeatureFlags";

const JSONL_PATH = path.join(process.cwd(), ".data", "search-analytics.jsonl");

export type SearchAnalyticsEntry = {
  query: string;
  normalizedQuery: string;
  resultCount: number;
  timestamp: number;
};

export async function logSearchAnalytics(entry: SearchAnalyticsEntry): Promise<void> {
  if (!isSearchAnalyticsEnabled()) return;

  if (usesPostgres()) {
    try {
      await getPool().query(
        `INSERT INTO search_analytics_events (query, normalized_query, result_count, created_at)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
        [entry.query, entry.normalizedQuery, entry.resultCount, entry.timestamp],
      );
      return;
    } catch {
      /* table may be missing — fall through to JSONL */
    }
  }

  try {
    await fs.mkdir(path.dirname(JSONL_PATH), { recursive: true });
    await fs.appendFile(JSONL_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* non-fatal */
  }
}
