"use client";

import { useCallback, useState } from "react";
import {
  OfferImportGoToDraftsBanner,
  OfferImportMetaFields,
  useOfferImportLocation,
  type OfferSourceFilter,
} from "./offerImportUi";

export function AdminCatalogOfferTextImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [categorySlug, setCategorySlug] = useState("remont");
  const { location, setLocation, cityLabel } = useOfferImportLocation();
  const [pastedText, setPastedText] = useState("");
  const [vkPaste, setVkPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const runParse = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setCreatedCount(0);
    try {
      const fd = new FormData();
      fd.set("kind", "text");
      fd.set("categorySlug", categorySlug);
      fd.set("city", cityLabel);
      fd.set("text", pastedText);
      if (vkPaste) fd.set("vkPaste", "1");

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
        : `Обработано записей: ${d.count ?? 0}. Ссылки на объявления попадут в кандидаты предложений.`,
      );
      onChanged?.();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }, [categorySlug, cityLabel, pastedText, vkPaste, onChanged, onGoToDrafts]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Из текста / VK</h3>
        <p className="mt-1 text-sm text-black/55">
          Вставьте текст или список ссылок на объявления. Для постов VK отметьте «Вставка из VK».
        </p>
      </div>

      <OfferImportMetaFields
        categorySlug={categorySlug}
        onCategoryChange={setCategorySlug}
        location={location}
        onLocationChange={setLocation}
        showSource={false}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={vkPaste} onChange={(e) => setVkPaste(e.target.checked)} />
        Вставка из VK
      </label>

      <label className="block text-sm">
        <span className="text-black/60">Текст или ссылки</span>
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={8}
          placeholder="Ссылки на объявления или текст объявления…"
          className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="button"
        disabled={busy || !pastedText.trim()}
        onClick={() => void runParse()}
        className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Извлечение…" : "Создать кандидатов предложений"}
      </button>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}
      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
    </div>
  );
}
