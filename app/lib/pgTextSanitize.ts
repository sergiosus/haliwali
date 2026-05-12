/** Strip U+0000 from values bound to PostgreSQL `text` columns. */
export function sanitizePgText(value: string | null | undefined, field?: string): string {
  if (value == null) return "";
  const s = String(value);
  if (!s.includes("\0")) return s;
  if (field) console.log("[LISTING_VIEW_SANITIZED_NULL_BYTE]", { field });
  return s.replace(/\0/g, "");
}

export function sanitizePgTextOrNull(value: string | null | undefined, field?: string): string | null {
  const s = sanitizePgText(value, field).trim();
  return s || null;
}
