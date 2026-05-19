import { Suspense } from "react";
import { SearchPageClient } from "./SearchPageClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 text-sm text-black/60">Загрузка…</main>}>
      <SearchPageClient />
    </Suspense>
  );
}
