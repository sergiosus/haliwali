"use client";

import { useCallback, useMemo, useState } from "react";
import { catalogSourceNameFromUrl, catalogSourceNameLabel } from "../../../lib/catalogSourceName";
import {
  OfferImportGoToDraftsBanner,
  OfferImportMetaFields,
  isOfferListingUrl,
  matchesOfferSourceFilter,
  useOfferImportLocation,
  OFFER_SOURCE_OPTIONS,
  type OfferSourceFilter,
} from "./offerImportUi";

type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
};

/** Offer web search — no company import candidate sessions. */
export function AdminCatalogOfferSearchImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState("remont");
  const { location, setLocation, cityLabel } = useOfferImportLocation();
  const [sourceFilter, setSourceFilter] = useState<OfferSourceFilter>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [brand, setBrand] = useState("");
  const [oemArticle, setOemArticle] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const filteredHits = useMemo(
    () =>
      hits.filter((h) => isOfferListingUrl(h.url) && matchesOfferSourceFilter(h.url, sourceFilter)),
    [hits, sourceFilter],
  );

  const runSearch = useCallback(async () => {
    if (!query.trim() || !cityLabel) return;
    setBusy(true);
    setMessage(null);
    setHits([]);
    setSelected(new Set());
    try {
      const r = await fetch("/api/admin/catalogs/discover/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [query.trim(), brand.trim(), oemArticle.trim()].filter(Boolean).join(" "),
          city: cityLabel,
          categorySlug,
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        candidates?: { url: string; title?: string; snippet?: string; domain?: string }[];
      };
      if (!d.ok) {
        setMessage(d.message ?? d.error ?? "Ошибка поиска");
        return;
      }
      const list = (d.candidates ?? []).map((c) => ({
        url: c.url,
        title: c.title ?? c.url,
        snippet: c.snippet ?? "",
        domain: c.domain ?? "",
      }));
      setHits(list);
      const offerHits = list.filter(
        (h) => isOfferListingUrl(h.url) && matchesOfferSourceFilter(h.url, sourceFilter),
      );
      setMessage(`Найдено объявлений: ${offerHits.length} из ${list.length} результатов`);
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }, [query, cityLabel, categorySlug, brand, oemArticle, sourceFilter]);

  const importSelected = useCallback(async () => {
    const urls = [...selected].filter((u) => isOfferListingUrl(u));
    if (urls.length === 0) return;
    setBusy(true);
    setMessage(null);
    setCreatedCount(0);
    try {
      const fd = new FormData();
      fd.set("kind", "urls");
      fd.set("categorySlug", categorySlug);
      fd.set("city", cityLabel);
      fd.set("urls", urls.join("\n"));

      const r = await fetch("/api/admin/catalogs/import/parse", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        errors?: { url: string; error: string }[];
        sourceOfferDrafts?: unknown[];
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка импорта");
        return;
      }
      const offerCount = d.sourceOfferDrafts?.length ?? 0;
      setCreatedCount(offerCount);
      const errN = d.errors?.length ?? 0;
      setMessage(
        `Создано кандидатов предложений: ${offerCount}${errN > 0 ? `, ошибок: ${errN}` : ""}`,
      );
      onChanged?.();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }, [selected, categorySlug, cityLabel, onChanged]);

  function toggleUrl(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">По поисковому запросу</h3>
        <p className="mt-1 text-sm text-black/55">
          Поиск объявлений на площадках. Выбранные ссылки импортируются только как кандидаты предложений.
        </p>
      </div>

      <label className="block text-sm sm:col-span-2">
        <span className="text-black/60">Что ищем</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="запчасти toyota camry"
          className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
        />
      </label>

      <OfferImportMetaFields
        categorySlug={categorySlug}
        onCategoryChange={setCategorySlug}
        location={location}
        onLocationChange={setLocation}
        showSource={false}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-black/60">Источник</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as OfferSourceFilter)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          >
            {OFFER_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена от, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена до, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="100000"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Бренд</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">OEM / артикул</span>
          <input
            value={oemArticle}
            onChange={(e) => setOemArticle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy || !query.trim() || !cityLabel}
        onClick={() => void runSearch()}
        className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Поиск…" : "Найти предложения"}
      </button>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}

      {filteredHits.length > 0 ?
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(new Set(filteredHits.map((h) => h.url)))}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
            >
              Выбрать все
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(new Set())}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
            >
              Снять выбор
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void importSelected()}
              className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Создать кандидатов предложений ({selected.size})
            </button>
          </div>
          <ul className="space-y-2">
            {filteredHits.map((h) => (
              <li key={h.url} className="rounded-2xl border border-black/10 bg-white p-3 text-sm">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(h.url)}
                    onChange={() => toggleUrl(h.url)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-black">{h.title}</span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-900">
                        {catalogSourceNameLabel(catalogSourceNameFromUrl(h.url))}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-black/50">{h.snippet || h.domain}</p>
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-[#c25a00] underline"
                    >
                      {h.url}
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      : null}

      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
    </div>
  );
}
