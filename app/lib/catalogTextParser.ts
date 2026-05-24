import type { CatalogImportDraftInput } from "./catalogImportTypes";

const PHONE_RE = /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function firstMatch(re: RegExp, text: string): string {
  const m = text.match(re);
  return m?.[0]?.trim() ?? "";
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return p.trim();
}

function normalizeWebsite(w: string): string {
  const t = w.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/\//, "")}`;
}

function pickCompanyName(lines: string[]): string {
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 2 || t.length > 120) continue;
    if (PHONE_RE.test(t) || EMAIL_RE.test(t) || URL_RE.test(t)) continue;
    if (/^(адрес|тел|телефон|email|e-mail|сайт|описание)/i.test(t)) continue;
    return t;
  }
  return lines[0]?.trim().slice(0, 120) ?? "";
}

function addressLikeLines(lines: string[]): string {
  for (const line of lines) {
    const t = line.trim();
    if (/\d/.test(t) && /(ул\.|улиц|пр\.|просп|пер\.|д\.|дом|оф\.|г\.|город)/i.test(t)) {
      return t.slice(0, 200);
    }
  }
  return "";
}

export function parseCatalogPastedText(
  text: string,
  defaults: { categorySlug: string; city: string; sourceUrl?: string | null },
): CatalogImportDraftInput {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blob = lines.join("\n");
  const phone = normalizePhone(firstMatch(PHONE_RE, blob));
  const email = firstMatch(EMAIL_RE, blob).toLowerCase();
  const website = normalizeWebsite(firstMatch(URL_RE, blob));
  const name = pickCompanyName(lines);
  const address = addressLikeLines(lines);
  const description = lines
    .filter((l) => l !== name && l !== address && !PHONE_RE.test(l) && !EMAIL_RE.test(l) && !URL_RE.test(l))
    .join(" ")
    .trim()
    .slice(0, 2000);

  return {
    name,
    categorySlug: defaults.categorySlug,
    city: defaults.city,
    address,
    phone,
    email,
    website,
    description,
    latitude: null,
    longitude: null,
    imageUrl: null,
    sourceUrl: defaults.sourceUrl ?? null,
    rawPayload: { kind: "text", lineCount: lines.length },
  };
}
