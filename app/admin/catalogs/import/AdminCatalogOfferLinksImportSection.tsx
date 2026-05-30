"use client";

import { useCallback, useState } from "react";
import {
  OfferImportGoToDraftsBanner,
  OfferImportMetaFields,
  useOfferImportLocation,
  type OfferSourceFilter,
} from "./offerImportUi";

export function AdminCatalogOfferLinksImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [categorySlug, setCategorySlug] = useState("remont");
  const { location, setLocation, cityLabel } = useOfferImportLocation();
  const [sourceFilter, setSourceFilter] = useState<OfferSourceFilter>("avito");
  const [urlsText, setUrlsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<{ url: string; error: string }[]>([]);
  const [createdCount, setCreatedCount] = useState(0);

  const runParse = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setParseErrors([]);
    setCreatedCount(0);
    try {
      const fd = new FormData();
      fd.set("kind", "urls");
      fd.set("categorySlug", categorySlug);
      fd.set("city", cityLabel);
      fd.set("urls", urlsText);

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
        setMessage(d.error ?? "Ошибка разбора");
        return;
      }
      setParseErrors(d.errors ?? []);
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
  }, [categorySlug, cityLabel, urlsText, onChanged, onGoToDrafts]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">По ссылкам</h3>
        <p className="mt-1 text-sm text-black/55">
          Вставьте ссылки на объявления с Avito, Drom, Youla, VK или сайта компании.
        </p>
      </div>

      <OfferImportMetaFields
        categorySlug={categorySlug}
        onCategoryChange={setCategorySlug}
        location={location}
        onLocationChange={setLocation}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        showSource
      />

      <label className="block text-sm">
        <span className="text-black/60">Ссылки на объявления</span>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={6}
          placeholder={"https://www.avito.ru/...\nhttps://auto.drom.ru/...\nhttps://youla.ru/..."}
          className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 font-mono text-sm"
        />
      </label>

      <button
        type="button"
        disabled={busy || !urlsText.trim()}
        onClick={() => void runParse()}
        className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Извлечение…" : "Создать кандидатов предложений"}
      </button>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}
      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
      {parseErrors.length > 0 ?
        <ul className="list-inside list-disc text-xs text-red-700">
          {parseErrors.map((e) => (
            <li key={e.url}>
              {e.url}: {e.error}
            </li>
          ))}
        </ul>
      : null}
    </div>
  );
}
