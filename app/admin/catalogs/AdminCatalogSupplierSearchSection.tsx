"use client";

import Link from "next/link";
import { CatalogSupplierSearchClient } from "../../components/catalog/CatalogSupplierSearchClient";
import { CATALOG_CATEGORY_SEED } from "../../lib/catalogTypes";

export function AdminCatalogSupplierSearchSection() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Поиск поставщиков</h2>
          <p className="mt-1 text-sm text-black/55">
            Проверка поиска по компаниям каталога и опубликованным предложениям (OEM, бренд, артикулы).
          </p>
        </div>
        <Link
          href="/catalogs/poisk-postavshchikov"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
        >
          Открыть на сайте ↗
        </Link>
      </div>
      <div className="rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
        <CatalogSupplierSearchClient
          categories={CATALOG_CATEGORY_SEED.map((c) => ({ ...c, companyCount: 0 }))}
        />
      </div>
    </div>
  );
}
