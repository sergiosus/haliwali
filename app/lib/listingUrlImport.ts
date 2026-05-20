/**
 * Safe public-page fetch + HTML meta extraction for «Перенести объявление».
 * No JS execution, no account scraping, no contact/phone extraction.
 */

export type ListingUrlImportResult = {
  title: string;
  description: string;
  priceRub: number | null;
};

export type ListingUrlImportErrorCode =
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "EMPTY_RESULT";

const MAX_URL_LENGTH = 2048;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 8000;

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".corp", ".home", ".lan"];

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

/** Remove phone-like fragments from public marketing text (do not import contacts). */
function stripPhoneLikeFragments(text: string): string {
  return text
    .replace(/(?:\+7|8)[\s\-()]*\d[\d\s\-()]{8,14}/g, " ")
    .replace(/\b\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPriceRub(...sources: string[]): number | null {
  for (const src of sources) {
    const m =
      /(\d[\d\s]{2,})\s*(?:₽|руб(?:\.|лей)?|р\.)/i.exec(src) ??
      /(?:₽|руб(?:\.|лей)?|р\.)\s*(\d[\d\s]{2,})/i.exec(src);
    if (m?.[1]) {
      const n = Number(m[1].replace(/\s/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) return Math.round(n);
    }
  }
  return null;
}

function clampText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function parseListingMetadataFromHtml(html: string): ListingUrlImportResult | null {
  if (!html || html.length < 20) return null;

  const ogTitle = extractMetaContent(html, "og:title", "property");
  const ogDesc = extractMetaContent(html, "og:description", "property");
  const metaDesc = extractMetaContent(html, "description", "name");
  const titleTag = extractTitleTag(html);

  const title = clampText(stripPhoneLikeFragments(ogTitle || titleTag || ""), MAX_TITLE_LEN);
  const description = clampText(
    stripPhoneLikeFragments(ogDesc || metaDesc || ""),
    MAX_DESC_LEN,
  );

  if (!title && !description) return null;

  const priceRub = detectPriceRub(title, description, ogDesc || "", metaDesc || "");

  return {
    title: title || description.slice(0, Math.min(80, description.length)),
    description: description || title,
    priceRub,
  };
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

/**
 * Fetch HTML from a validated public URL (GET only, size + time limits).
 */
export async function fetchPublicListingPageHtml(
  startUrl: URL,
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
          "User-Agent": "HaliwaliListingTransfer/1.0 (+https://haliwali.ru)",
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
      if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) {
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
): Promise<{ ok: true; data: ListingUrlImportResult } | { ok: false; code: ListingUrlImportErrorCode }> {
  const validated = validatePublicHttpUrl(rawUrl);
  if (!validated.ok) return { ok: false, code: validated.code };

  const fetched = await fetchPublicListingPageHtml(validated.url);
  if ("error" in fetched) return { ok: false, code: fetched.error };

  const parsed = parseListingMetadataFromHtml(fetched.html);
  if (!parsed) return { ok: false, code: "EMPTY_RESULT" };

  return { ok: true, data: parsed };
}
