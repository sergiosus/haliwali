import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { adminPrivilegesActive } from "./serverAdminSession";
import { checkIpRateLimit, extractIp } from "./serverAbuse";
import { getListingById } from "./serverListingsStore";
import {
  hashListingViewIp,
  hashListingViewUserAgent,
  recordListingView,
  type ListingViewLocationHint,
} from "./serverListingViews";
import { getUserIdFromSessionCookie } from "./serverSession";
import { sanitizePgText, sanitizePgTextOrNull } from "./pgTextSanitize";

const VIEWER_COOKIE = "haliwali_vsid";
const COOKIE_MAX = 60 * 60 * 24 * 400;
const VIEW_IP_WINDOW_MS = 10 * 60 * 1000;
const VIEW_IP_MAX = 120;

function viewerCookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

function parseLocationHint(raw: unknown): ListingViewLocationHint {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const city =
    typeof o.city === "string" ? sanitizePgText(o.city, "location.city").trim().slice(0, 120) : "";
  const region =
    typeof o.region === "string" ? sanitizePgText(o.region, "location.region").trim().slice(0, 120) : "";
  const country =
    typeof o.country === "string" ? sanitizePgText(o.country, "location.country").trim().slice(0, 80) : "";
  return {
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(country ? { country } : {}),
  };
}

export async function handleRecordListingViewRequest(
  req: Request,
  listingIdRaw: string,
  opts?: { location?: ListingViewLocationHint },
) {
  const listingId = sanitizePgText(listingIdRaw, "listing_id").trim();
  if (!listingId) return { status: 400 as const, body: { error: "BAD_REQUEST" } };

  const ip = sanitizePgText(extractIp(req), "ip");
  const rl = await checkIpRateLimit({
    path: sanitizePgText("listing_view", "source"),
    ip: sanitizePgText(ip, "ip"),
    limit: VIEW_IP_MAX,
    windowMs: VIEW_IP_WINDOW_MS,
  });
  if (!rl.ok) return { status: 429 as const, body: { error: "RATE_LIMIT" } };

  const listing = await getListingById(listingId);
  if (!listing) return { status: 404 as const, body: { error: "NOT_FOUND" } };

  const ownerUserId = sanitizePgTextOrNull(listing.ownerId, "owner_user_id") ?? "";
  const sessionUserId = sanitizePgTextOrNull(await getUserIdFromSessionCookie(), "viewer_user_id") ?? "";
  const admin = await adminPrivilegesActive();
  const skipCount = Boolean(admin || (sessionUserId && ownerUserId && sessionUserId === ownerUserId));

  const jar = await cookies();
  let anonymousViewerId = sanitizePgTextOrNull(jar.get(VIEWER_COOKIE)?.value, "viewer_fingerprint") ?? "";
  if (!anonymousViewerId) anonymousViewerId = randomBytes(18).toString("hex");

  const locationRaw = opts?.location ?? {};
  const location = {
    ...(locationRaw.city ? { city: sanitizePgText(locationRaw.city, "city") } : {}),
    ...(locationRaw.region ? { region: sanitizePgText(locationRaw.region, "region") } : {}),
    ...(locationRaw.country ? { country: sanitizePgText(locationRaw.country, "country") } : {}),
  };

  const userAgent = sanitizePgText(req.headers.get("user-agent") ?? "", "user_agent").trim();
  const result = await recordListingView({
    listingId: sanitizePgText(listingId, "listing_id"),
    viewerUserId: sessionUserId ? sanitizePgTextOrNull(sessionUserId, "viewer_user_id") : null,
    anonymousViewerId: sessionUserId ? null : sanitizePgTextOrNull(anonymousViewerId, "viewer_fingerprint"),
    ownerUserId: ownerUserId ? sanitizePgTextOrNull(ownerUserId, "owner_user_id") : null,
    location,
    ipHash: hashListingViewIp(ip),
    userAgentHash: userAgent ? hashListingViewUserAgent(userAgent) : null,
    skipCount,
  });

  return {
    status: 200 as const,
    body: { ok: true, count: result.count, incremented: result.incremented, skipped: result.skipped },
    setViewerCookie: sessionUserId ? null : anonymousViewerId,
  };
}

export function applyListingViewViewerCookie(
  res: { cookies: { set: (name: string, value: string, opts: ReturnType<typeof viewerCookieOpts>) => void } },
  viewerId: string | null,
) {
  if (!viewerId) return;
  res.cookies.set(VIEWER_COOKIE, sanitizePgText(viewerId, "viewer_fingerprint"), viewerCookieOpts(COOKIE_MAX));
}
