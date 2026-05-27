import { Suspense } from "react";
import MapBrowseClient from "./MapBrowseClient";

export const dynamic = "force-dynamic";

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-57px)] items-center justify-center bg-black/[0.03] text-sm text-black/50">
          Загрузка карты…
        </div>
      }
    >
      <MapBrowseClient />
    </Suspense>
  );
}
