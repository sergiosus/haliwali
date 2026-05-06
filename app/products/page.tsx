"use client";

import Link from "next/link";
import { useMemo } from "react";
import { directoryColumns } from "../lib/directory";
import { isPublicStatus, useListingsStore } from "../lib/listings";

export default function ProductsIndexPage() {
  const col = directoryColumns.find((c) => c.tab === "products");
  const { loaded, listings } = useListingsStore();

  const countsBySlug = useMemo(() => {
    const m = new Map<string, number>();
    if (!loaded) return m;
    for (const l of listings) {
      if (!isPublicStatus(l.status)) continue;
      if (!l.categorySlug) continue;
      m.set(l.categorySlug, (m.get(l.categorySlug) ?? 0) + 1);
    }
    return m;
  }, [loaded, listings]);

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <main className="mx-auto w-full max-w-[900px] px-4 pb-16 sm:px-6">
        <div className="py-4" />

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-lg font-semibold text-gray-900">Товары</div>
            <Link href="/map" className="inline-flex items-center rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-black/[0.03]">
              На карте
            </Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {(col?.items ?? []).map((item) => {
              const count = countsBySlug.get(item.slug) ?? 0;
              return (
                <Link
                  key={item.slug}
                  href={`/category/${item.slug}`}
                  className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-gray-800 transition-colors duration-150 hover:bg-gray-100"
                >
                  <div className="min-w-0 text-[15px] font-medium leading-[1.25] text-gray-800">
                    <span className="truncate leading-[1.25]">
                      {item.title}
                      {count > 0 ? <span className="text-gray-400"> · {count}</span> : null}
                    </span>
                  </div>
                  <span className="text-gray-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

