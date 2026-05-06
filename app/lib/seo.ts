export function translitRuToLat(input: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };

  return input
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function listingSlugFromTitle(title: string) {
  return translitRuToLat(title);
}

export function listingPath(id: string, title: string) {
  const slug = listingSlugFromTitle(title);
  return `/listing/${id}${slug ? `-${slug}` : ""}`;
}

export function extractListingIdFromSlug(slugOrId: string) {
  // Accept both "id" and "id-title-slug".
  return slugOrId.split("-")[0] ?? slugOrId;
}

export function truncateMetaDescription(text: string, min = 120, max = 160) {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  // Try to cut on a word boundary close to max, but not too short.
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace >= min ? cut.slice(0, lastSpace) : cut;
  return `${safe}…`;
}

