import { confidenceFromStored, confidenceLabelRu } from "./catalogConfidence";
import type { CatalogImportDraftInput } from "./catalogImportTypes";
import { CATALOG_CATEGORY_SEED } from "./catalogTypes";

export function buildDraftWarnings(input: CatalogImportDraftInput): string[] {
  const w: string[] = [];
  if (!input.name.trim()) w.push("Нет названия компании");
  if (!input.categorySlug.trim()) w.push("Не указана категория");
  if (!input.city.trim()) w.push("Не указан город");
  if (!input.phone.trim() && !input.email.trim()) w.push("Нет телефона и email");
  if (!input.sourceUrl?.trim()) w.push("Нет source_url");
  if (!input.description.trim()) w.push("Пустое описание");
  const validCat = CATALOG_CATEGORY_SEED.some((c) => c.slug === input.categorySlug);
  if (input.categorySlug && !validCat) w.push("Неизвестная категория");
  const score100 = confidenceFromStored(input.confidenceScore ?? 0.5);
  if (score100 < 45) w.push(`Низкое доверие (${confidenceLabelRu(score100)})`);
  return w;
}

export function csvRowToDraftInput(
  row: import("./catalogCsvImport").CatalogCsvRow,
  defaults: { categorySlug: string; city: string },
): CatalogImportDraftInput {
  return {
    name: row.name.trim(),
    categorySlug: (row.category || defaults.categorySlug).trim().toLowerCase(),
    city: (row.city || defaults.city).trim(),
    address: row.address.trim(),
    phone: row.phone.trim(),
    email: row.email.trim().toLowerCase(),
    website: row.website.trim(),
    description: row.description.trim(),
    latitude: row.latitude,
    longitude: row.longitude,
    imageUrl: row.imageUrl?.trim() || null,
    sourceUrl: row.sourceUrl?.trim() || null,
    rawPayload: { kind: "csv" },
  };
}

