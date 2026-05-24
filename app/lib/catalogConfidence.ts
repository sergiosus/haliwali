/** Import draft confidence (0–100) and Russian labels. */

export type ConfidenceTier = "high" | "medium" | "low";

export function computeImportConfidence(fields: {
  name: string;
  phone: string;
  address: string;
  website: string;
  description: string;
  imageUrl: string | null;
  city: string;
  targetCity: string;
}): number {
  let score = 0;
  if (fields.name.trim()) score += 25;
  if (fields.phone.trim()) score += 20;
  if (fields.address.trim()) score += 15;
  if (fields.website.trim()) score += 10;
  if (fields.description.trim().length >= 20) score += 10;
  if (fields.imageUrl?.trim()) score += 10;
  const c = fields.city.trim().toLowerCase();
  const t = fields.targetCity.trim().toLowerCase();
  if (c && t && (c === t || c.includes(t) || t.includes(c))) score += 10;
  return Math.min(100, score);
}

export function confidenceTier(score: number): ConfidenceTier {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function confidenceLabelRu(score: number): string {
  const tier = confidenceTier(score);
  if (tier === "high") return "Высокое доверие";
  if (tier === "medium") return "Среднее доверие";
  return "Низкое доверие";
}

/** Stored as 0–1 in DB */
export function confidenceToStored(score100: number): number {
  return Math.round((score100 / 100) * 100) / 100;
}

export function confidenceFromStored(stored: number): number {
  return Math.round(stored * 100);
}
