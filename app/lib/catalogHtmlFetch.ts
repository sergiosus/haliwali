import { logCatalogParse } from "./catalogCatalogLog";
import { assertPublicHttpUrl, assertPublicResolvableHost } from "./catalogUrlSafety";

export const CATALOG_FETCH_MAX_BYTES = 1_000_000;
export const CATALOG_FETCH_TIMEOUT_MS = 10_000;
export const CATALOG_FETCH_MAX_REDIRECTS = 2;

const BLOCKED_HOST_PATTERNS = [
  /^2gis\./i,
  /(^|\.)2gis\.(ru|com|kz|uz)/i,
  /(^|\.)google\.(com|ru)\/maps/i,
  /(^|\.)maps\.google\./i,
  /(^|\.)yandex\.(ru|com)\/maps/i,
  /(^|\.)yandex\.(ru|com)\/sprav/i,
];

export type FetchedHtml = {
  url: URL;
  html: string;
  byteLength: number;
};

export function assertCatalogFetchAllowed(rawUrl: string): URL {
  const url = assertPublicHttpUrl(rawUrl);
  const hostPath = `${url.hostname}${url.pathname}`;
  for (const re of BLOCKED_HOST_PATTERNS) {
    if (re.test(hostPath) || re.test(url.hostname)) {
      throw new Error("BLOCKED_PLATFORM");
    }
  }
  return url;
}

function isLoginWall(html: string): boolean {
  const t = html.slice(0, 12000).toLowerCase();
  return (
    (t.includes("login") && t.includes("password") && t.includes("vk.com")) ||
    t.includes("access denied") ||
    (t.includes("войдите") && t.includes("vk id")) ||
    (t.includes("captcha") && t.includes("robot"))
  );
}

async function fetchOnce(url: URL, signal: AbortSignal): Promise<Response> {
  return fetch(url.toString(), {
    signal,
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      "User-Agent": "HaliwaliCatalogExtractor/1.0 (+https://haliwali.ru)",
    },
    cache: "no-store",
  });
}

function resolveRedirect(current: URL, location: string | null): URL {
  if (!location) throw new Error("FETCH_FAILED");
  const next = new URL(location, current);
  return assertCatalogFetchAllowed(next.toString());
}

export async function fetchPublicHtml(rawUrl: string, retry = true): Promise<FetchedHtml> {
  let url = assertCatalogFetchAllowed(rawUrl);
  await assertPublicResolvableHost(url);

  let lastError: Error | null = null;
  const attempts = retry ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CATALOG_FETCH_TIMEOUT_MS);
    try {
      let hops = 0;
      let res = await fetchOnce(url, ac.signal);

      while (res.status >= 300 && res.status < 400) {
        if (hops >= CATALOG_FETCH_MAX_REDIRECTS) throw new Error("TOO_MANY_REDIRECTS");
        const loc = res.headers.get("location");
        url = resolveRedirect(url, loc);
        await assertPublicResolvableHost(url);
        hops += 1;
        res = await fetchOnce(url, ac.signal);
      }

      if (res.status === 401 || res.status === 403) throw new Error("AUTH_REQUIRED");
      if (!res.ok) throw new Error("FETCH_FAILED");

      const buf = await res.arrayBuffer();
      if (buf.byteLength > CATALOG_FETCH_MAX_BYTES) throw new Error("RESPONSE_TOO_LARGE");
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (isLoginWall(html)) throw new Error("AUTH_REQUIRED");

      logCatalogParse("fetch_ok", {
        host: url.hostname,
        bytes: buf.byteLength,
        redirects: hops,
      });

      return { url, html, byteLength: buf.byteLength };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("FETCH_FAILED");
      logCatalogParse("fetch_fail", {
        host: url.hostname,
        code: lastError.message,
        attempt: attempt + 1,
      });
      if (lastError.message === "AUTH_REQUIRED" || lastError.message === "BLOCKED_PLATFORM") break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("FETCH_FAILED");
}
