/** Safe catalog pipeline logs — no API keys, no full PII. */

function safeMeta(meta?: Record<string, unknown>): string {
  if (!meta) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token")) continue;
    if (typeof v === "string" && v.length > 120) {
      parts.push(`${k}=${v.slice(0, 40)}…`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${v}`);
    } else if (v == null) {
      /* skip */
    } else if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length}]`);
    } else {
      parts.push(`${k}=…`);
    }
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function logCatalogDiscover(message: string, meta?: Record<string, unknown>): void {
  console.info(`[CATALOG_DISCOVER] ${message}${safeMeta(meta)}`);
}

export function logCatalogImport(message: string, meta?: Record<string, unknown>): void {
  console.info(`[CATALOG_IMPORT] ${message}${safeMeta(meta)}`);
}

export function logCatalogParse(message: string, meta?: Record<string, unknown>): void {
  console.info(`[CATALOG_PARSE] ${message}${safeMeta(meta)}`);
}

export function logCatalogPublish(message: string, meta?: Record<string, unknown>): void {
  console.info(`[CATALOG_PUBLISH] ${message}${safeMeta(meta)}`);
}

export function logCatalogDrafts(message: string, meta?: Record<string, unknown>): void {
  console.info(`[CATALOG_DRAFTS] ${message}${safeMeta(meta)}`);
}
