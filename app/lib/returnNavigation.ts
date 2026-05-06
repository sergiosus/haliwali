/**
 * Append `return=<path>` for post-navigation back links (see also pathnameWithSearchSansReturn).
 */
export function appendReturnUrlQuery(href: string, returnTarget: string): string {
  try {
    const u = new URL(href, "http://haliwali.local");
    u.searchParams.set("return", returnTarget);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

/** Current path + query without nested `return` (avoid return chains). */
export function pathnameWithSearchSansReturn(pathname: string, sp: URLSearchParams): string {
  const next = new URLSearchParams(sp.toString());
  next.delete("return");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
