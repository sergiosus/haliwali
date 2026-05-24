/** Normalized host key for import dedup (e.g. izhevsk.dostavto.ru). */
export function normalizeImportDomain(urlOrHost: string): string {
  const t = urlOrHost.trim();
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return t
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]!
      .toLowerCase();
  }
}

export function domainSiteUrl(domain: string): string {
  const d = normalizeImportDomain(domain);
  return d ? `https://${d}` : "";
}

const CONTACT_PATH_RE = /\/(contacts?|контакты?|contact-us|about|о-нас|o-nas|company|requisites|реквизиты)(?:\/|$)/i;

/** Prefer homepage, then contact/about, then shortest path. */
export function pickBestUrlForDomain(urls: string[]): string {
  const valid = urls.filter((u) => /^https?:\/\//i.test(u.trim()));
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0]!;

  const scored = valid.map((raw) => {
    try {
      const u = new URL(raw);
      const path = u.pathname.toLowerCase() || "/";
      let score = 0;
      if (path === "/" || path === "") score += 100;
      if (CONTACT_PATH_RE.test(path)) score += 80;
      if (/about|о-нас|o-nas/i.test(path)) score += 60;
      score -= path.length;
      return { raw, score };
    } catch {
      return { raw, score: -999 };
    }
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.raw ?? valid[0]!;
}

export function findContactUrlInList(urls: string[]): string | null {
  for (const raw of urls) {
    try {
      if (CONTACT_PATH_RE.test(new URL(raw).pathname)) return raw;
    } catch {
      /* skip */
    }
  }
  return null;
}
