/** Normalize listing id from slugified routes (e.g. task-123-title → task-123). */
export function normalizeListingId(input: string) {
  const s = input.trim();
  const m = s.match(/^([a-zA-Z]+-\d+)(?:-.*)?$/);
  return (m?.[1] ?? s).trim();
}
