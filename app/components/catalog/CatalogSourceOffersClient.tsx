"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { CatalogSourceOfferCard } from "./CatalogSourceOfferCard";

export function CatalogSourceOffersClient() {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [offers, setOffers] = useState<CatalogSourceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (query.trim().length >= 2) p.set("q", query.trim());
      const r = await fetch(`/api/catalogs/source-offers?${p.toString()}`, { cache: "no-store" });
      const data = (await r.json()) as { offers?: CatalogSourceOffer[] };
      setOffers(data.offers ?? []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
            Объявления из источников
          </h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Индекс внешних предложений (Avito, Drom, VK, сайты компаний). Отдельно от объявлений
            пользователей Haliwali.
          </p>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSubmittedQ(q.trim());
                void load(q);
              }
            }}
            placeholder="Поиск по названию, бренду, OEM…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-4 text-sm shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          />
          <button
            type="button"
            onClick={() => {
              setSubmittedQ(q.trim());
              void load(q);
            }}
            disabled={loading}
            className="h-11 rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50"
          >
            Найти
          </button>
        </div>

        {loading ?
          <p className="mt-8 text-sm text-black/45">Загрузка…</p>
        : offers.length > 0 ?
          <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {offers.map((offer) => (
              <li key={offer.id}>
                <CatalogSourceOfferCard offer={offer} />
              </li>
            ))}
          </ul>
        : (
          <div className="mt-8 rounded-2xl border border-dashed border-black/[0.12] bg-white px-5 py-10 text-center">
            <p className="text-sm font-medium text-black/70">
              {submittedQ.length >= 2 ? "Ничего не найдено" : "Пока нет опубликованных предложений"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-black/45">
              После одобрения в админке импортированные объявления появятся здесь с ссылкой на
              оригинальный источник.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
