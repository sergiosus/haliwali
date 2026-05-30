import Link from "next/link";
import { CATALOG_OFFERS_HUB_HREF } from "../../lib/catalogOffersNav";

export function CatalogSectionPlaceholder({
  title,
  lead,
}: {
  title: string;
  lead: string;
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-black/55 sm:text-base">{lead}</p>
        <div className="mt-8 rounded-2xl border border-dashed border-black/[0.12] bg-white px-5 py-10 text-center shadow-sm">
          <p className="text-sm font-medium text-black/70">Раздел готовится</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-black/45">
            Скоро здесь появится больше функций. Опубликованные предложения — в разделе «Объявления из источников».
          </p>
          <Link
            href={CATALOG_OFFERS_HUB_HREF}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000]"
          >
            Компании
          </Link>
        </div>
      </div>
    </div>
  );
}
