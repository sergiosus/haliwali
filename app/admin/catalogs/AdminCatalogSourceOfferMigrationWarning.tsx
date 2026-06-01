export function AdminCatalogSourceOfferMigrationWarning({
  missing,
}: {
  missing?: string[];
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Схема предложений не готова</p>
      <p className="mt-1">
        Примените миграции на сервере БД (в порядке):
      </p>
      <ol className="mt-2 list-inside list-decimal space-y-1 font-mono text-xs">
        <li>db/migrations/20260531_catalog_source_offers.sql</li>
        <li>db/migrations/20260602_catalog_source_offer_type_cover.sql</li>
      </ol>
      {missing && missing.length > 0 ?
        <p className="mt-2 text-xs">
          Не хватает: {missing.join(", ")}
        </p>
      : null}
    </div>
  );
}
