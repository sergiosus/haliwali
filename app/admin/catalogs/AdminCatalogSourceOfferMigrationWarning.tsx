export function AdminCatalogSourceOfferMigrationWarning() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Таблица предложений не создана. Примените миграцию{" "}
      <code className="rounded bg-amber-100/80 px-1">20260531_catalog_source_offers.sql</code>.
    </div>
  );
}
