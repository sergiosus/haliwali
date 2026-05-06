import { NextResponse } from "next/server";
import { siteUrl } from "./siteUrl";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromConfiguredUrl(raw: string): string | null {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return null;
  try {
    const url = new URL(t.includes("://") ? t : `https://${t}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Origins explicitly trusted for cookie/session-backed mutations (CSRF mitigation via `Origin`). */
export function allowedMutationOrigins(): Set<string> {
  const s = new Set<string>();
  for (const o of [
    originFromConfiguredUrl(process.env.NEXT_PUBLIC_SITE_URL ?? ""),
    originFromConfiguredUrl(process.env.SITE_URL ?? ""),
    originFromConfiguredUrl(siteUrl()),
  ]) {
    if (o) s.add(o);
  }
  return s;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

/**
 * For POST/PUT/PATCH/DELETE: if `Origin` is sent and does not match configured site URLs
 * (or loopback in development), reject with 403.
 *
 * Requests with no `Origin` header are allowed (CLI, some proxies, uncommon clients).
 */
export function denyIfMutationOriginForbidden(req: Request): NextResponse | null {
  const method = (req.method ?? "GET").toUpperCase();
  if (!MUTATING.has(method)) return null;

  const originHdr = req.headers.get("origin");
  if (!originHdr?.trim()) return null;

  const origin = originHdr.trim();
  if (/^null$/i.test(origin)) return null;

  if (process.env.NODE_ENV !== "production" && isLoopbackOrigin(origin)) return null;

  const allowed = allowedMutationOrigins();
  if (allowed.has(origin)) return null;

  return NextResponse.json({ error: "FORBIDDEN", message: "Недопустимый запрос (origin)." }, { status: 403 });
}
