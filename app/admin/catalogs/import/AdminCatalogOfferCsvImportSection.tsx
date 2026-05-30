"use client";

import { useCallback, useState } from "react";
import { OfferImportGoToDraftsBanner, OfferImportMetaFields, useOfferImportLocation } from "./offerImportUi";

export function AdminCatalogOfferCsvImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [categorySlug, setCategorySlug] = useState("remont");
  const { location, setLocation, cityLabel } = useOfferImportLocation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const runParse = useCallback(
    async (file: File) => {
      setBusy(true);
      setMessage(null);
      setCreatedCount(0);
      try {
        const fd = new FormData();
        fd.set("kind", "csv");
        fd.set("categorySlug", categorySlug);
        fd.set("city", cityLabel);
        fd.set("file", file);

        const r = await fetch("/api/admin/catalogs/import/parse", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const d = (await r.json()) as {
          ok?: boolean;
          error?: string;
          count?: number;
          sourceOfferDrafts?: unknown[];
        };
        if (!r.ok) {
          setMessage(d.error ?? "Ошибка разбора");
          return;
        }
        const offerCount = d.sourceOfferDrafts?.length ?? 0;
        setCreatedCount(offerCount);
        setMessage(
          offerCount > 0 ?
            `Создано кандидатов предложений: ${offerCount}`
          : `Обработано строк: ${d.count ?? 0}. URL объявлений попадут в кандидаты предложений.`,
        );
        onChanged?.();
      } catch {
        setMessage("Ошибка сети");
      } finally {
        setBusy(false);
      }
    },
    [categorySlug, cityLabel, onChanged, onGoToDrafts],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">CSV</h3>
        <p className="mt-1 text-sm text-black/55">
          Загрузите CSV со ссылками на объявления или данными для извлечения предложений.
        </p>
      </div>

      <OfferImportMetaFields
        categorySlug={categorySlug}
        onCategoryChange={setCategorySlug}
        location={location}
        onLocationChange={setLocation}
        showSource={false}
      />

      <label className="block text-sm">
        <span className="text-black/60">Файл CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runParse(f);
          }}
        />
      </label>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}
      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
    </div>
  );
}
