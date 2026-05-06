/** Shown form validation failures for phone inputs. */
export const PHONE_VALIDATION_MESSAGE = "Введите корректный номер телефона";

/**
 * Canonical form for lookups:
 * — Optional leading "+" then digits only (international, or "00..." → "+..."),
 * — Or digits-only (national notation; never forced to +7).
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const s = trimmed.replace(/[\s\-–—.()[\]]/g, "").replace(/\u2212/g, "");

  if (s.startsWith("00")) {
    const rest = s.slice(2).replace(/\D/g, "");
    if (!rest) return "";
    return `+${rest}`;
  }

  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (!digits) return "";
    return `+${digits}`;
  }

  const digits = s.replace(/\D/g, "");
  return digits;
}

/** E.164-style digit length: 7–15 inclusive. */
export function phoneDigitLength(normalized: string): number {
  return normalized.replace(/\D/g, "").length;
}

export function isValidPhone(rawOrNormalized: string): boolean {
  const n = normalizePhone(rawOrNormalized);
  if (!n) return false;
  const len = phoneDigitLength(n);
  return len >= 7 && len <= 15;
}

/** `tel:` href body: keep +international digit form when present. */
export function normalizePhoneForTelHref(phone: string): string | null {
  const n = normalizePhone(phone);
  if (!n || !isValidPhone(n)) return null;
  const digits = n.replace(/\D/g, "");
  const body = n.startsWith("+") ? `+${digits}` : digits;
  return `tel:${body}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeIdentifier(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.includes("@")) return normalizeEmail(v);
  return normalizePhone(v);
}
