import type { Metadata } from "next";
import { CatalogSectionPlaceholder } from "../../components/catalog/CatalogSectionPlaceholder";
import { siteUrl } from "../../lib/siteUrl";

export const metadata: Metadata = {
  title: "Предложения — Каталог предложений — Haliwali",
  description: "Внешние предложения с площадок и сайтов компаний. Раздел в разработке.",
  alternates: { canonical: `${siteUrl()}/catalogs/predlozheniya` },
  robots: { index: false, follow: true },
};

export default function CatalogOffersPlaceholderPage() {
  return (
    <CatalogSectionPlaceholder
      title="Предложения"
      lead="Здесь будут предложения, импортированные с Avito, Drom, VK и сайтов компаний — отдельно от объявлений пользователей."
    />
  );
}
