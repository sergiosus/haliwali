export function AdminCatalogOfferImportSuccessBanner({
  count,
  onOpenImport,
}: {
  count: number;
  onOpenImport?: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
      <p className="font-medium">Найденные объявления добавлены в Импорт предложений.</p>
      {onOpenImport ?
        <button
          type="button"
          onClick={onOpenImport}
          className="mt-2 rounded-full bg-violet-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
        >
          Открыть импорт предложений
        </button>
      : null}
    </div>
  );
}
