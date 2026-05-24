import { Suspense } from "react";
import { MarketplaceSearchPage } from "../components/MarketplaceSearchPage";

export const metadata = {
  title: "Поиск товаров по маркетплейсам — Haliwali",
  description: "Находите товары из Ozon, Wildberries, AliExpress и других площадок",
};

export default function MarketplacesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-6 py-16 text-center text-sm text-black/50">
          Загрузка…
        </div>
      }
    >
      <MarketplaceSearchPage />
    </Suspense>
  );
}
