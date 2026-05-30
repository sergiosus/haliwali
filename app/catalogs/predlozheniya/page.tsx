import type { Metadata } from "next";
import { CatalogSourceOffersClient } from "../../components/catalog/CatalogSourceOffersClient";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Объявления из источников — Каталог предложений — Haliwali",
  description:
    "Индекс внешних предложений с Avito, Drom, VK и сайтов компаний. Ссылка на оригинальный источник.",
  alternates: { canonical: `${siteUrl()}/catalogs/predlozheniya` },
};

export default function CatalogSourceOffersPage() {
  return <CatalogSourceOffersClient />;
}
