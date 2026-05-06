export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "https://haliwali.ru";
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(pathname: string): string {
  const p = String(pathname ?? "").trim();
  if (!p) return siteUrl();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  return `${siteUrl()}${p.startsWith("/") ? "" : "/"}${p}`;
}

