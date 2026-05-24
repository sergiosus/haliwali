/**
 * eBay Buy Browse API — OAuth client credentials + item_summary search.
 * Server-only; no scraping.
 */

import type { ExternalMarketplaceCard } from "./externalMarketplaceProviders";

const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const TOKEN_SKEW_MS = 60_000;

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type EbayItemSummary = {
  title?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
};

type EbaySearchResponse = {
  itemSummaries?: EbayItemSummary[];
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function ebayApiBase(): string {
  return (process.env.EBAY_API_BASE ?? "https://api.ebay.com").replace(/\/$/, "");
}

function getEbayCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId =
    process.env.EBAY_CLIENT_ID?.trim() ||
    process.env.EBAY_APP_ID?.trim() ||
    process.env.EBAY_OAUTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.EBAY_CLIENT_SECRET?.trim() ||
    process.env.EBAY_CERT_ID?.trim() ||
    process.env.EBAY_CLIENT_CERT?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isEbayBrowseApiConfigured(): boolean {
  return Boolean(getEbayCredentials());
}

function ebayMarketplaceId(): string {
  return process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US";
}

async function fetchApplicationAccessToken(): Promise<string | null> {
  const creds = getEbayCredentials();
  if (!creds) return null;

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_OAUTH_SCOPE,
  });

  try {
    const res = await fetch(`${ebayApiBase()}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EbayTokenResponse;
    const token = data.access_token?.trim();
    if (!token) return null;
    const ttlSec = typeof data.expires_in === "number" ? data.expires_in : 7200;
    tokenCache = {
      token,
      expiresAt: now + ttlSec * 1000 - TOKEN_SKEW_MS,
    };
    return token;
  } catch {
    return null;
  }
}

function formatEbayPrice(value?: string, currency?: string): string | null {
  const v = value?.trim();
  if (!v || !/\d/.test(v)) return null;
  const c = (currency ?? "USD").toUpperCase();
  if (c === "USD") return `$${v}`;
  if (c === "EUR") return `€${v}`;
  if (c === "GBP") return `£${v}`;
  if (c === "RUB") return `${v} ₽`;
  return `${v} ${c}`;
}

function mapItemSummaryToCard(item: EbayItemSummary): ExternalMarketplaceCard | null {
  const title = item.title?.trim();
  const externalUrl = item.itemWebUrl?.trim();
  const imageUrl = item.image?.imageUrl?.trim();
  const price = formatEbayPrice(item.price?.value, item.price?.currency);

  if (!title || !externalUrl || !imageUrl || !price) return null;
  if (!/^https?:\/\//i.test(externalUrl) || !/^https?:\/\//i.test(imageUrl)) return null;

  return {
    providerId: "ebay",
    sourceName: "eBay",
    title,
    snippet: null,
    price,
    imageUrl,
    externalUrl,
    linkOnly: false,
  };
}

/**
 * Browse API: GET /buy/browse/v1/item_summary/search
 */
export async function searchEbayItemSummaries(
  query: string,
  limit = 8,
): Promise<ExternalMarketplaceCard[]> {
  const q = query.trim();
  if (q.length < 2 || !isEbayBrowseApiConfigured()) return [];

  const token = await fetchApplicationAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });

  try {
    const res = await fetch(
      `${ebayApiBase()}/buy/browse/v1/item_summary/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": ebayMarketplaceId(),
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as EbaySearchResponse;
    const cards: ExternalMarketplaceCard[] = [];
    for (const item of data.itemSummaries ?? []) {
      const card = mapItemSummaryToCard(item);
      if (card) cards.push(card);
    }
    return cards;
  } catch {
    return [];
  }
}
