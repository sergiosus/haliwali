import type { Metadata } from "next";
import { CatalogOffersNav } from "../components/catalog/CatalogOffersNav";
import { siteUrl } from "../lib/siteUrl";

export const metadata: Metadata = {
  title: "Каталог предложений — Haliwali",
  description:
    "Компании, внешние предложения и поиск поставщиков — отдельно от объявлений пользователей.",
  alternates: { canonical: `${siteUrl()}/catalogs/companies` },
  openGraph: {
    title: "Каталог предложений — Haliwali",
    description: "Компании по отраслям, предложения с площадок и поиск поставщиков.",
    type: "website",
    url: `${siteUrl()}/catalogs/companies`,
    siteName: "Haliwali",
  },
};

export default function CatalogsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CatalogOffersNav />
      {children}
    </>
  );
}
