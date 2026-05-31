"use client";

import { SettlementLocationField } from "../../../components/location/SettlementLocationField";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../../lib/catalogDiscoverLocationStorage";
import { classifySourceUrl } from "../../../lib/catalogSourceClassifier";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";
import { useEffect, useState } from "react";

export type OfferSourceFilter =
  | "all"
  | "avito"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

export const OFFER_SOURCE_OPTIONS: { value: OfferSourceFilter; label: string }[] = [
  { value: "all", label: "Любой источник" },
  { value: "avito", label: "Avito" },
  { value: "drom", label: "Drom" },
  { value: "youla", label: "Youla" },
  { value: "vk", label: "VK" },
  { value: "company_site", label: "Сайт компании" },
  { value: "other", label: "Другое" },
];

export function useOfferImportLocation() {
  const [location, setLocation] = useState<CatalogDiscoverLocation | null>(null);
  useEffect(() => {
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, []);
  return { location, setLocation, cityLabel: catalogDiscoverCityLabel(location) };
}

export function OfferImportMetaFields({
  categorySlug,
  onCategoryChange,
  location,
  onLocationChange,
  sourceFilter,
  onSourceChange,
  showSource = true,
}: {
  categorySlug: string;
  onCategoryChange: (v: string) => void;
  location: CatalogDiscoverLocation | null;
  onLocationChange: (v: CatalogDiscoverLocation | null) => void;
  sourceFilter?: OfferSourceFilter;
  onSourceChange?: (v: OfferSourceFilter) => void;
  showSource?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showSource && sourceFilter !== undefined && onSourceChange ?
        <label className="block text-sm">
          <span className="text-black/60">Источник</span>
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value as OfferSourceFilter)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          >
            {OFFER_SOURCE_OPTIONS.filter((o) => o.value !== "all").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      : null}
      <label className="block text-sm">
        <span className="text-black/60">Категория</span>
        <select
          value={categorySlug}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
        >
          {CATALOG_CATEGORY_SEED.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <SettlementLocationField
          value={location}
          onChange={onLocationChange}
          onPersist={persistCatalogDiscoverLocation}
          label="Город / регион"
          placeholder="Ижевск"
        />
      </div>
    </div>
  );
}

export function isOfferListingUrl(url: string): boolean {
  try {
    return classifySourceUrl(new URL(url.startsWith("http") ? url : `https://${url}`)) === "listing";
  } catch {
    return false;
  }
}

export function matchesOfferSourceFilter(url: string, filter: OfferSourceFilter): boolean {
  if (filter === "all") return true;
  const lower = url.toLowerCase();
  if (filter === "avito") return lower.includes("avito.ru");
  if (filter === "drom") return lower.includes("drom.ru") || lower.includes("auto.ru");
  if (filter === "youla") return lower.includes("youla.ru");
  if (filter === "vk") return lower.includes("vk.com") || lower.includes("vk.ru");
  if (filter === "company_site") {
    return (
      !lower.includes("avito.ru") &&
      !lower.includes("drom.ru") &&
      !lower.includes("auto.ru") &&
      !lower.includes("youla.ru") &&
      !lower.includes("vk.com") &&
      !lower.includes("vk.ru")
    );
  }
  return (
    !lower.includes("avito.ru") &&
    !lower.includes("drom.ru") &&
    !lower.includes("auto.ru") &&
    !lower.includes("youla.ru") &&
    !lower.includes("vk.com") &&
    !lower.includes("vk.ru")
  );
}

export function OfferImportGoToDraftsBanner({
  count,
  onGoToDrafts,
}: {
  count: number;
  onGoToDrafts?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
      <p className="font-medium">Создано кандидатов предложений: {count}.</p>
      {onGoToDrafts ?
        <button
          type="button"
          onClick={onGoToDrafts}
          className="mt-2 rounded-full bg-violet-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
        >
          Открыть кандидаты предложений
        </button>
      : null}
    </div>
  );
}
