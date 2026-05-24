import { computeImportConfidence, confidenceToStored } from "./catalogConfidence";

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function metaContent(html: string, prop: string, attr: "property" | "name" = "property"): string {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return decodeHtmlEntities(m2?.[1]?.trim() ?? "");
}

export function titleTag(html: string): string {
  const m = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i);
  return decodeHtmlEntities(m?.[1]?.trim() ?? "");
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return p.trim();
}

export function normalizeWebsite(w: string): string {
  const t = w.trim();
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`.replace(/\/$/, "");
  } catch {
    return t;
  }
}

export function normPhoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function normWebsiteKey(website: string): string {
  try {
    const u = new URL(normalizeWebsite(website) || "https://x");
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return website.trim().toLowerCase();
  }
}

export function phonesFromText(text: string): string[] {
  const re = /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
  const found = text.match(re) ?? [];
  const out: string[] = [];
  for (const p of found) {
    const n = normalizePhone(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function emailsFromText(text: string): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export function addressLikeFromText(text: string): string {
  const lines = text.split(/\n|\. /);
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 8 && /\d/.test(t) && /(ул\.|улиц|пр\.|просп|пер\.|д\.|дом|оф\.|г\.|город|обл\.)/i.test(t)) {
      return t.slice(0, 300);
    }
  }
  return "";
}

export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!.trim()) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") out.push(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === "object") {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export function pickOrgNode(nodes: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const node of nodes) {
    const t = String(node["@type"] ?? "");
    if (/Organization|LocalBusiness|Store|AutoDealer|ProfessionalService/i.test(t)) return node;
  }
  return nodes[0] ?? null;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function computeConfidenceScore(
  fields: {
    name: string;
    phone: string;
    email: string;
    address: string;
    description: string;
    sourceUrl: string;
    website?: string;
    imageUrl?: string | null;
    city?: string;
    hasJsonLd?: boolean;
  },
  targetCity = "",
): number {
  let score = computeImportConfidence({
    name: fields.name,
    phone: fields.phone,
    address: fields.address,
    website: fields.website ?? fields.sourceUrl,
    description: fields.description,
    imageUrl: fields.imageUrl ?? null,
    city: fields.city ?? "",
    targetCity,
  });
  if (fields.hasJsonLd) score = Math.min(100, score + 5);
  if (fields.email.trim()) score = Math.min(100, score + 5);
  return confidenceToStored(score);
}
