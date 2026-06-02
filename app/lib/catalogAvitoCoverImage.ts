/**
 * Avito SERP card cover image — one URL, priority-ordered sources.
 */

import { decodeJsonString } from "./catalogOfferSearchText";

export type AvitoCoverImageSource =
  | "card_img"
  | "data_src"
  | "data_lazy"
  | "srcset"
  | "json_ld"
  | "page_data"
  | "og_image"
  | "none";

export type AvitoCoverExtraction = {
  coverImageUrl: string | null;
  imageSource: AvitoCoverImageSource;
};

function decodeCtx(ctx: string): string {
  return ctx.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
}

/** Absolute https URL for Avito / allowed CDN. */
export function resolveAvitoImageUrl(raw: string, baseUrl: string): string | null {
  let t = decodeJsonString(raw).trim().replace(/^['"]|['"]$/g, "");
  if (!t || /^data:/i.test(t)) return null;

  if (t.startsWith("//")) t = `https:${t}`;
  else if (t.startsWith("/")) {
    try {
      t = new URL(t, baseUrl).href;
    } catch {
      return null;
    }
  } else if (!/^https?:\/\//i.test(t)) {
    try {
      t = new URL(t, baseUrl).href;
    } catch {
      return null;
    }
  }

  if (!/^https:\/\//i.test(t)) return null;
  if (!isLikelyListingImage(t)) return null;
  return t.slice(0, 500);
}

function isLikelyListingImage(url: string): boolean {
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (/(?:sprite|logo|favicon|icon|placeholder|1x1|blank\.)/i.test(url)) return false;
  if (/img\.avito\.st|avatars\.mds\.yandex|\.avito\.ru/i.test(url)) return true;
  return /^https:\/\/[\w.-]+\//i.test(url);
}

function pickImgAttr(blob: string, attr: string, baseUrl: string): string | null {
  const re = new RegExp(`<img[^>]*\\b${attr}=["']([^"']+)["']`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    const url = resolveAvitoImageUrl(m[1]!, baseUrl);
    if (url) return url;
  }
  return null;
}

function pickSrcset(blob: string, baseUrl: string): string | null {
  const re = /<(?:source|img)[^>]*\bsrcset=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    const first = m[1]!
      .split(",")[0]
      ?.trim()
      .split(/\s+/)[0];
    if (!first) continue;
    const url = resolveAvitoImageUrl(first, baseUrl);
    if (url) return url;
  }
  return null;
}

function pickJsonLdImage(blob: string, baseUrl: string): string | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(blob)) !== null) {
    const block = sm[1] ?? "";
    const direct =
      block.match(/"image"\s*:\s*"([^"]+)"/i) ??
      block.match(/"image"\s*:\s*\[\s*"([^"]+)"/i) ??
      block.match(/"contentUrl"\s*:\s*"([^"]+)"/i);
    if (direct?.[1]) {
      const url = resolveAvitoImageUrl(direct[1], baseUrl);
      if (url) return url;
    }
  }
  const inline =
    blob.match(/"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i) ??
    blob.match(/"image"\s*:\s*\[\s*"([^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i);
  if (inline?.[1]) {
    const url = resolveAvitoImageUrl(inline[1], baseUrl);
    if (url) return url;
  }
  return null;
}

function pickPageDataImage(blob: string, baseUrl: string): string | null {
  const cdnRe = /https:\/\/\d+\.img\.avito\.st\/image\/[^\s"'<>\\]+/gi;
  const cdn = blob.match(cdnRe);
  if (cdn?.[0]) {
    const url = resolveAvitoImageUrl(cdn[0], baseUrl);
    if (url) return url;
  }

  const patterns = [
    /"preview"\s*:\s*\{[^}]{0,400}?"(\d+x\d+)"\s*:\s*"([^"]+)"/i,
    /"(\d+x\d+)"\s*:\s*"(https:\/\/[^"]+img\.avito[^"]+)"/i,
    /"imageUrl"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"(https:\/\/[^"]+img\.avito[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    const raw = m?.[2] ?? m?.[1];
    if (!raw) continue;
    const url = resolveAvitoImageUrl(raw, baseUrl);
    if (url) return url;
  }
  return null;
}

/** Extract one cover from Avito search card HTML/JSON fragment. */
export function extractAvitoCoverFromCardContext(ctx: string, baseUrl: string): AvitoCoverExtraction {
  if (!ctx?.trim()) return { coverImageUrl: null, imageSource: "none" };
  const blob = decodeCtx(ctx);

  const steps: { source: AvitoCoverImageSource; url: string | null }[] = [
    { source: "card_img", url: pickImgAttr(blob, "src", baseUrl) },
    { source: "data_src", url: pickImgAttr(blob, "data-src", baseUrl) },
    {
      source: "data_lazy",
      url: pickImgAttr(blob, "data-lazy", baseUrl) ?? pickImgAttr(blob, "data-lazy-src", baseUrl),
    },
    { source: "srcset", url: pickSrcset(blob, baseUrl) },
    { source: "json_ld", url: pickJsonLdImage(blob, baseUrl) },
    { source: "page_data", url: pickPageDataImage(blob, baseUrl) },
  ];

  for (const step of steps) {
    if (step.url) return { coverImageUrl: step.url, imageSource: step.source };
  }
  return { coverImageUrl: null, imageSource: "none" };
}

/** @deprecated use extractAvitoCoverFromCardContext */
export function extractAvitoListingThumbnail(ctx: string, baseUrl = "https://www.avito.ru"): string | null {
  return extractAvitoCoverFromCardContext(ctx, baseUrl).coverImageUrl;
}

/** Admin UI label for image extraction source. */
export function imageSourceAdminLabel(
  imageSource: AvitoCoverImageSource | string | null | undefined,
): string {
  switch (imageSource) {
    case "card_img":
      return "img";
    case "data_src":
    case "data_lazy":
      return "data-src";
    case "srcset":
      return "srcset";
    case "json_ld":
    case "page_data":
      return "json";
    case "og_image":
      return "og";
    case "none":
    case null:
    case undefined:
      return "none";
    default:
      return String(imageSource);
  }
}

export function coverImageDiagnosticsLabel(
  coverImageUrl: string | null | undefined,
  imageSource: AvitoCoverImageSource | string | null | undefined,
): string {
  const found = Boolean(coverImageUrl?.trim());
  const src = imageSourceAdminLabel(found ? imageSource : "none");
  return `image: ${found ? "found" : "not found"} · imageSource: ${src}`;
}
