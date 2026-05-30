import type { Metadata } from "next";
import { CatalogSectionPlaceholder } from "../../components/catalog/CatalogSectionPlaceholder";
import { siteUrl } from "../../lib/siteUrl";

export const metadata: Metadata = {
  title: "Поиск поставщиков — Каталог предложений — Haliwali",
  description: "Поиск по компаниям, предложениям и артикулам. Раздел в разработке.",
  alternates: { canonical: `${siteUrl()}/catalogs/poisk-postavshchikov` },
  robots: { index: false, follow: true },
};

export default function CatalogSupplierSearchPlaceholderPage() {
  return (
    <CatalogSectionPlaceholder
      title="Поиск поставщиков"
      lead="Здесь будет единый поиск по компаниям, внешним предложениям и OEM/артикулам."
    />
  );
}
