/**
 * Safe public-page fetch + HTML/JSON extraction for «Перенести объявление».
 * No JS execution, no account scraping, no contact/phone extraction.
 */

export type ListingImportSource = "avito" | "drom" | "other";

export type ListingImportStatus = "success" | "partial" | "failed";

export type ListingUrlImportResult = {
  title: string;
  description: string;
  priceRub: number | null;
  location: string | null;
  categoryHint: string | null;
  imageUrls: string[];
};

export type ListingUrlImportErrorCode =
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "EMPTY_RESULT";

const MAX_URL_LENGTH = 2048;
const FETCH_TIMEOUT_MS = 14_000;
const MAX_RESPONSE_BYTES = 768 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 8000;
const MAX_JSON_NODES = 1200;
const MAX_IMAGE_URLS = 5;

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".corp", ".home", ".lan"];

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

function fetchUserAgent(source: ListingImportSource): string {
  return source === "avito" || source === "drom" ? MOBILE_UA : BROWSER_UA;
}

function isBotBlockedHtml(html: string): boolean {
  const head = html.slice(0, 12_000).toLowerCase();
  if (extractMetaContent(html, "og:title", "property")) return false;
  const blocked =
    head.includes("captcha") ||
    head.includes("cf-challenge") ||
    head.includes("доступ ограничен") ||
    head.includes("access denied") ||
    head.includes("servicepipe") ||
    head.includes("perimeterx");
  return blocked;
}

function extractScriptJsonAfterMarker(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < Math.min(html.length, start + 600_000); i++) {
    const ch = html[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractHtmlField(html: string, re: RegExp): string {
  const m = re.exec(html);
  if (!m?.[1]) return "";
  return stripHtmlTags(m[1]);
}

function extractAvitoFromHtml(html: string, pageOrigin: string): Partial<ListingUrlImportResult> {
  const merged: Partial<ListingUrlImportResult> = {};
  const title = pickText(
    extractHtmlField(html, /<h1[^>]*data-marker="item-view\/title"[^>]*>([\s\S]*?)<\/h1>/i),
    extractHtmlField(html, /data-marker="item-view\/title"[^>]*title="([^"]+)"/i),
    extractMetaContent(html, "og:title", "property"),
  );
  const description = pickText(
    extractHtmlField(
      html,
      /data-marker="item-view\/item-description"[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
    ),
    extractMetaContent(html, "og:description", "property"),
  );
  const priceText = pickText(
    extractHtmlField(html, /data-marker="item-view\/item-price"[^>]*>([\s\S]*?)<\/[^>]+>/i),
    extractHtmlField(html, /itemprop="price"[^>]*content="(\d+)"/i),
  );
  const location = pickText(
    extractHtmlField(html, /data-marker="item-view\/location"[^>]*>([\s\S]*?)<\/[^>]+>/i),
    extractHtmlField(html, /itemprop="address"[^>]*>([\s\S]*?)<\/[^>]+>/i),
  );
  mergeImportPatch(merged, {
    title: title ? clampText(stripPhoneLikeFragments(title), MAX_TITLE_LEN) : "",
    description: description ? clampText(stripPhoneLikeFragments(description), MAX_DESC_LEN) : "",
    priceRub: detectPriceRub(priceText, title, description),
    location: location ? clampText(location, 120) : null,
    categoryHint: extractHtmlField(html, /data-marker="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/i) || null,
    imageUrls: [],
  });

  const priceJson = /"price"\s*:\s*\{\s*"value"\s*:\s*(\d+)/i.exec(html);
  if (priceJson?.[1] && merged.priceRub == null) {
    merged.priceRub = parsePriceNumber(priceJson[1]);
  }

  const seen = { n: 0 };
  for (const marker of [
    "window.__preloadedState__ =",
    "window.__preloadedState__=",
    "window.__initialData__ =",
    "window.__initialData__=",
  ]) {
    const node = extractScriptJsonAfterMarker(html, marker);
    if (node) walkJsonForListing(node, pageOrigin, merged, seen);
  }

  const ogImage = extractMetaContent(html, "og:image", "property");
  if (ogImage) {
    const img = sanitizeImageUrl(ogImage, pageOrigin);
    if (img) mergeImportPatch(merged, { imageUrls: [img] });
  }

  const imageRe = /https?:\/\/[\w.-]+\.avito\.ru\/[\w./%-]+\.(?:jpg|jpeg|webp|png)/gi;
  const imgs: string[] = [];
  let im: RegExpExecArray | null;
  while ((im = imageRe.exec(html)) !== null && imgs.length < MAX_IMAGE_URLS) {
    const u = sanitizeImageUrl(im[0], pageOrigin);
    if (u) imgs.push(u);
  }
  if (imgs.length) mergeImportPatch(merged, { imageUrls: imgs });

  return merged;
}

function extractDromFromHtml(html: string, pageOrigin: string): Partial<ListingUrlImportResult> {
  const merged: Partial<ListingUrlImportResult> = {};
  const title = pickText(
    extractMetaContent(html, "og:title", "property"),
    extractHtmlField(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    extractTitleTag(html),
  );
  const description = pickText(
    extractMetaContent(html, "og:description", "property"),
    extractMetaContent(html, "description", "name"),
    extractHtmlField(html, /class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
  );
  mergeImportPatch(merged, {
    title: title ? clampText(stripPhoneLikeFragments(title), MAX_TITLE_LEN) : "",
    description: description ? clampText(stripPhoneLikeFragments(description), MAX_DESC_LEN) : "",
    priceRub: detectPriceRub(title, description),
    location: null,
    categoryHint: null,
    imageUrls: [],
  });

  const seen = { n: 0 };
  for (const marker of ["window.__NUXT__=", "window.__NUXT__ =", "__NEXT_DATA__", "window.__data__="]) {
    const node = extractScriptJsonAfterMarker(html, marker);
    if (node) walkJsonForListing(node, pageOrigin, merged, seen);
  }

  const priceM = /"price"\s*:\s*"?(\d[\d\s]{2,})"?/i.exec(html);
  if (priceM?.[1] && merged.priceRub == null) merged.priceRub = parsePriceNumber(priceM[1]);

  const ogImage = extractMetaContent(html, "og:image", "property");
  if (ogImage) {
    const img = sanitizeImageUrl(ogImage, pageOrigin);
    if (img) mergeImportPatch(merged, { imageUrls: [img] });
  }

  return merged;
}

export function logListingImport(source: ListingImportSource, status: ListingImportStatus, reason: string): void {
  console.log(`[LISTING_IMPORT] source=${source} status=${status} reason=${reason}`);
}

export function detectListingImportSource(url: URL): ListingImportSource {
  const host = url.hostname.toLowerCase();
  if (host.includes("avito.")) return "avito";
  if (host.includes("drom.")) return "drom";
  return "other";
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (![a, b, Number(m[3]), Number(m[4])].every((n) => n >= 0 && n <= 255)) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "0.0.0.0" || h === "[::1]" || h === "::1") return true;
  if (h.endsWith(".localhost")) return true;
  for (const suf of BLOCKED_HOST_SUFFIXES) {
    if (h === suf.slice(1) || h.endsWith(suf)) return true;
  }
  if (isPrivateIpv4(h)) return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.includes("metadata") || h.includes("169.254.")) return true;
  return false;
}

/** Validate user-supplied http(s) URL and block SSRF targets. */
export function validatePublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; code: ListingUrlImportErrorCode } {
  const t = (raw ?? "").trim();
  if (!t || t.length > MAX_URL_LENGTH) return { ok: false, code: "INVALID_URL" };
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, code: "INVALID_URL" };
  if (parsed.username || parsed.password) return { ok: false, code: "INVALID_URL" };
  if (isBlockedHostname(parsed.hostname)) return { ok: false, code: "BLOCKED_URL" };
  return { ok: true, url: parsed };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtmlTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractMetaContent(html: string, key: string, by: "name" | "property"): string | null {
  const attr = by === "name" ? "name" : "property";
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return stripHtmlTags(m[1]);
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m?.[1]) return null;
  return stripHtmlTags(m[1]);
}

function stripPhoneLikeFragments(text: string): string {
  return text
    .replace(/(?:\+7|8)[\s\-()]*\d[\d\s\-()]{8,14}/g, " ")
    .replace(/\b\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePriceNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 1_000_000_000) {
    return Math.round(raw);
  }
  if (typeof raw === "string") {
    const m =
      /(\d[\d\s]{2,})\s*(?:₽|руб(?:\.|лей)?|р\.)/i.exec(raw) ??
      /(?:₽|руб(?:\.|лей)?|р\.)\s*(\d[\d\s]{2,})/i.exec(raw) ??
      /(\d[\d\s]{2,})/.exec(raw);
    if (m?.[1]) {
      const n = Number(m[1].replace(/\s/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) return Math.round(n);
    }
  }
  return null;
}

function detectPriceRub(...sources: string[]): number | null {
  for (const src of sources) {
    const n = parsePriceNumber(src);
    if (n) return n;
  }
  return null;
}

function clampText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pickText(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return "";
}

function readJsonLdObjects(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]!.trim()) as unknown);
    } catch {
      /* skip */
    }
  }
  return out;
}

function readEmbeddedJsonScripts(html: string): unknown[] {
  const out: unknown[] = [];
  const patterns = [
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*id=["'][^"']*state[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const chunk = m[1]!.trim();
      if (chunk.length < 40 || chunk.length > 400_000) continue;
      try {
        out.push(JSON.parse(chunk) as unknown);
      } catch {
        /* skip */
      }
    }
  }
  const assignRe = /(?:window\.)?__(?:INITIAL|PRELOAD|NUXT|STATE|DATA)__\s*=\s*(\{[\s\S]{80,300000}?\})\s*;/gi;
  let am: RegExpExecArray | null;
  while ((am = assignRe.exec(html)) !== null) {
    try {
      out.push(JSON.parse(am[1]!) as unknown);
    } catch {
      /* skip */
    }
  }
  return out;
}

function extractLocationFromRecord(o: Record<string, unknown>): string | null {
  const direct = pickText(
    typeof o.location === "string" ? o.location : null,
    typeof o.city === "string" ? o.city : null,
    typeof o.address === "string" ? o.address : null,
    typeof o.region === "string" ? o.region : null,
  );
  if (direct) return direct;
  const geo = o.geo ?? o.Geo ?? o.addressDetails ?? o.locationDetails;
  if (geo && typeof geo === "object") {
    const g = geo as Record<string, unknown>;
    const nested = pickText(
      typeof g.address === "string" ? g.address : null,
      typeof g.city === "string" ? g.city : null,
      typeof g.name === "string" ? g.name : null,
      typeof g.title === "string" ? g.title : null,
    );
    if (nested) return nested;
  }
  return null;
}

function extractImagesFromRecord(o: Record<string, unknown>, pageOrigin: string): string[] {
  const urls: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const u = sanitizeImageUrl(raw, pageOrigin);
    if (u) urls.push(u);
  };
  if (typeof o.image === "string") push(o.image);
  else if (Array.isArray(o.image)) {
    for (const item of o.image) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object" && typeof (item as { url?: string }).url === "string") {
        push((item as { url: string }).url);
      }
    }
  }
  if (Array.isArray(o.images)) {
    for (const item of o.images) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const img = item as Record<string, unknown>;
        if (typeof img.url === "string") push(img.url);
        if (typeof img.src === "string") push(img.src);
        if (typeof img["640x480"] === "string") push(img["640x480"]);
      }
    }
  }
  return [...new Set(urls)].slice(0, MAX_IMAGE_URLS);
}

function extractCategoryHint(o: Record<string, unknown>): string | null {
  const hint = pickText(
    typeof o.category === "string" ? o.category : null,
    typeof o.categoryName === "string" ? o.categoryName : null,
    typeof o.rubric === "string" ? o.rubric : null,
    typeof o.breadcrumb === "string" ? o.breadcrumb : null,
  );
  return hint || null;
}

function scoreListingCandidate(o: Record<string, unknown>): number {
  let score = 0;
  const title = pickText(
    typeof o.title === "string" ? o.title : null,
    typeof o.name === "string" ? o.name : null,
    typeof o.subject === "string" ? o.subject : null,
    typeof o.itemTitle === "string" ? o.itemTitle : null,
  );
  const desc = pickText(
    typeof o.description === "string" ? o.description : null,
    typeof o.text === "string" ? o.text : null,
    typeof o.itemDescription === "string" ? o.itemDescription : null,
  );
  if (title.length >= 4) score += 3;
  if (desc.length >= 10) score += 3;
  if (
    parsePriceNumber(o.price) ||
    parsePriceNumber(o.priceValue) ||
    parsePriceNumber(o.rubPrice) ||
    parsePriceNumber(o.value) ||
    parsePriceNumber((o.priceDetailed as { value?: unknown })?.value)
  ) {
    score += 2;
  }
  if (extractLocationFromRecord(o)) score += 1;
  if (extractCategoryHint(o)) score += 1;
  return score;
}

function extractFromRecord(o: Record<string, unknown>, pageOrigin: string): Partial<ListingUrlImportResult> | null {
  if (scoreListingCandidate(o) < 2) return null;
  const offers = o.offers as Record<string, unknown> | undefined;
  const priceRub =
    parsePriceNumber(o.price) ??
    parsePriceNumber(o.priceValue) ??
    parsePriceNumber(o.priceRub) ??
    parsePriceNumber((o.priceDetailed as { value?: unknown } | undefined)?.value) ??
    parsePriceNumber(offers?.price);
  const title = clampText(
    stripPhoneLikeFragments(
      pickText(
        typeof o.title === "string" ? o.title : null,
        typeof o.name === "string" ? o.name : null,
        typeof o.subject === "string" ? o.subject : null,
        typeof o.itemTitle === "string" ? o.itemTitle : null,
        typeof o.heading === "string" ? o.heading : null,
      ),
    ),
    MAX_TITLE_LEN,
  );
  const description = clampText(
    stripPhoneLikeFragments(
      pickText(
        typeof o.description === "string" ? o.description : null,
        typeof o.text === "string" ? o.text : null,
        typeof o.itemDescription === "string" ? o.itemDescription : null,
        typeof o.descriptionHtml === "string" ? stripHtmlTags(o.descriptionHtml) : null,
      ),
    ),
    MAX_DESC_LEN,
  );
  if (!title && !description) return null;
  return {
    title,
    description: description || title,
    priceRub,
    location: extractLocationFromRecord(o) ? clampText(extractLocationFromRecord(o)!, 120) : null,
    categoryHint: extractCategoryHint(o),
    imageUrls: extractImagesFromRecord(o, pageOrigin),
  };
}

function walkJsonForListing(node: unknown, pageOrigin: string, best: Partial<ListingUrlImportResult>, seen: { n: number }): void {
  if (seen.n >= MAX_JSON_NODES) return;
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      walkJsonForListing(item, pageOrigin, best, seen);
      if (seen.n >= MAX_JSON_NODES) return;
    }
    return;
  }
  if (typeof node !== "object") return;
  seen.n += 1;
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const isProduct =
    type === "Product" ||
    type === "Offer" ||
    (Array.isArray(type) && (type.includes("Product") || type.includes("Offer")));
  if (isProduct || scoreListingCandidate(o) >= 5) {
    const patch = extractFromRecord(o, pageOrigin);
    if (patch) mergeImportPatch(best, patch);
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walkJsonForListing(v, pageOrigin, best, seen);
    if (seen.n >= MAX_JSON_NODES) return;
  }
}

function mergeImportPatch(target: Partial<ListingUrlImportResult>, patch: Partial<ListingUrlImportResult>): void {
  if (patch.title && (!target.title || patch.title.length > target.title.length)) target.title = patch.title;
  if (patch.description && (!target.description || patch.description.length > target.description.length)) {
    target.description = patch.description;
  }
  if (patch.priceRub != null && target.priceRub == null) target.priceRub = patch.priceRub;
  if (patch.location && !target.location) target.location = patch.location;
  if (patch.categoryHint && !target.categoryHint) target.categoryHint = patch.categoryHint;
  if (patch.imageUrls?.length) {
    const merged = [...(target.imageUrls ?? []), ...patch.imageUrls];
    target.imageUrls = [...new Set(merged)].slice(0, MAX_IMAGE_URLS);
  }
}

function sanitizeImageUrl(raw: string, pageOrigin: string): string | null {
  const t = raw.trim();
  if (!t || t.startsWith("data:")) return null;
  try {
    const u = new URL(t.startsWith("//") ? `https:${t}` : t, pageOrigin);
    if (u.protocol !== "https:") return null;
    if (u.hostname === "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseMetaLayer(html: string): Partial<ListingUrlImportResult> {
  const ogTitle = extractMetaContent(html, "og:title", "property");
  const ogDesc = extractMetaContent(html, "og:description", "property");
  const metaDesc = extractMetaContent(html, "description", "name");
  const twitterTitle = extractMetaContent(html, "twitter:title", "name");
  const titleTag = extractTitleTag(html);
  const title = clampText(stripPhoneLikeFragments(pickText(ogTitle, twitterTitle, titleTag)), MAX_TITLE_LEN);
  const description = clampText(stripPhoneLikeFragments(pickText(ogDesc, metaDesc)), MAX_DESC_LEN);
  const priceRub = detectPriceRub(title, description, ogDesc || "", metaDesc || "");
  return { title, description, priceRub, location: null, categoryHint: null, imageUrls: [] };
}

function finalizeImportResult(patch: Partial<ListingUrlImportResult>): ListingUrlImportResult | null {
  const title = (patch.title ?? "").trim();
  const description = (patch.description ?? "").trim();
  if (!title && !description) return null;
  return {
    title: title || description.slice(0, Math.min(80, description.length)),
    description: description || title,
    priceRub: patch.priceRub ?? null,
    location: patch.location ?? null,
    categoryHint: patch.categoryHint ?? null,
    imageUrls: patch.imageUrls ?? [],
  };
}

function importStatusFor(result: ListingUrlImportResult): ListingImportStatus {
  const hasTitle = result.title.trim().length >= 4;
  const hasDesc = result.description.trim().length >= 10;
  const hasExtra = result.priceRub != null || Boolean(result.location) || Boolean(result.categoryHint);
  if (hasTitle && hasDesc && hasExtra) return "success";
  if (hasTitle || hasDesc) return "partial";
  return "failed";
}

export function parseListingMetadataFromHtml(
  html: string,
  pageUrl: string,
  source: ListingImportSource = "other",
): { data: ListingUrlImportResult; status: ListingImportStatus } | null {
  if (!html || html.length < 20) return null;
  if (isBotBlockedHtml(html)) return null;

  const pageOrigin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "https://example.com";
    }
  })();

  const merged: Partial<ListingUrlImportResult> = {};
  mergeImportPatch(merged, parseMetaLayer(html));

  if (source === "avito") mergeImportPatch(merged, extractAvitoFromHtml(html, pageOrigin));
  else if (source === "drom") mergeImportPatch(merged, extractDromFromHtml(html, pageOrigin));

  const seen = { n: 0 };
  for (const node of readJsonLdObjects(html)) {
    walkJsonForListing(node, pageOrigin, merged, seen);
  }
  for (const node of readEmbeddedJsonScripts(html)) {
    walkJsonForListing(node, pageOrigin, merged, seen);
  }

  const ogImage = extractMetaContent(html, "og:image", "property");
  if (ogImage) {
    const img = sanitizeImageUrl(ogImage, pageOrigin);
    if (img) mergeImportPatch(merged, { imageUrls: [img] });
  }

  const finalized = finalizeImportResult(merged);
  if (!finalized) return null;
  return { data: finalized, status: importStatusFor(finalized) };
}

async function readResponseBodyLimited(res: Response): Promise<string> {
  const len = res.headers.get("content-length");
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > MAX_RESPONSE_BYTES) {
      throw new Error("RESPONSE_TOO_LARGE");
    }
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const t = await res.text();
    if (t.length > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
    return t;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function validateRedirectUrl(url: URL): boolean {
  return validatePublicHttpUrl(url.toString()).ok;
}

export async function fetchPublicListingPageHtml(
  startUrl: URL,
  source: ListingImportSource = "other",
): Promise<{ html: string } | { error: ListingUrlImportErrorCode }> {
  let current = startUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
          "User-Agent": fetchUserAgent(source),
          Referer: `${current.origin}/`,
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { error: "FETCH_FAILED" };
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          return { error: "FETCH_FAILED" };
        }
        if (!validateRedirectUrl(next)) return { error: "BLOCKED_URL" };
        current = next;
        continue;
      }

      if (!res.ok) return { error: "FETCH_FAILED" };

      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml") && !ct.includes("json")) {
        return { error: "FETCH_FAILED" };
      }

      let html: string;
      try {
        html = await readResponseBodyLimited(res);
      } catch (e) {
        if (e instanceof Error && e.message === "RESPONSE_TOO_LARGE") {
          return { error: "RESPONSE_TOO_LARGE" };
        }
        return { error: "FETCH_FAILED" };
      }
      return { html };
    }
    return { error: "FETCH_FAILED" };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { error: "TIMEOUT" };
    return { error: "FETCH_FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

export async function importListingFromPublicUrl(
  rawUrl: string,
): Promise<
  | { ok: true; data: ListingUrlImportResult; status: ListingImportStatus; source: ListingImportSource }
  | { ok: false; code: ListingUrlImportErrorCode; source: ListingImportSource }
> {
  const validated = validatePublicHttpUrl(rawUrl);
  if (!validated.ok) {
    const source: ListingImportSource = "other";
    logListingImport(source, "failed", validated.code);
    return { ok: false, code: validated.code, source };
  }

  const source = detectListingImportSource(validated.url);
  const fetched = await fetchPublicListingPageHtml(validated.url, source);
  if ("error" in fetched) {
    logListingImport(source, "failed", fetched.error);
    return { ok: false, code: fetched.error, source };
  }

  if (isBotBlockedHtml(fetched.html)) {
    logListingImport(source, "failed", "BOT_BLOCKED");
    return { ok: false, code: "FETCH_FAILED", source };
  }

  const parsed = parseListingMetadataFromHtml(fetched.html, validated.url.toString(), source);
  if (!parsed) {
    logListingImport(source, "failed", "EMPTY_RESULT");
    return { ok: false, code: "EMPTY_RESULT", source };
  }

  logListingImport(source, parsed.status, "parsed");
  return { ok: true, data: parsed.data, status: parsed.status, source };
}
