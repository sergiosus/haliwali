export function slugifyCatalogText(input: string): string {
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
  const lowered = (input ?? "").trim().toLowerCase();
  let out = "";
  for (const ch of lowered) {
    if (map[ch]) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|[-_./]/.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function uniqueCompanySlug(base: string, used: Set<string>): string {
  let slug = slugifyCatalogText(base) || "company";
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i += 1;
  const next = `${slug}-${i}`;
  used.add(next);
  return next;
}
