function containsNullByte(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 0) return true;
  }
  return false;
}

/** Strip U+0000 from values bound to PostgreSQL `text` columns. */
export function sanitizePgText(value: string | null | undefined, field?: string): string {
  if (value == null) return "";
  const s = String(value);
  if (!containsNullByte(s)) return s;
  const lengthBefore = s.length;
  const cleaned = s.replace(/\0/g, "");
  if (field) {
    console.log("[LISTING_VIEW_NULL_BYTE_FIELD]", {
      field,
      lengthBefore,
      lengthAfter: cleaned.length,
    });
  }
  return cleaned;
}

export function sanitizePgTextOrNull(value: string | null | undefined, field?: string): string | null {
  const s = sanitizePgText(value, field).trim();
  return s || null;
}

export function sanitizePgTextArray(values: readonly string[], field: string): string[] {
  return values.map((value, index) => sanitizePgText(value, `${field}[${index}]`));
}
