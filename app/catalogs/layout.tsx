import type { Metadata } from "next";
import { siteUrl } from "../lib/siteUrl";

export const metadata: Metadata = {
  title: "Каталоги компаний — Haliwali",
  description: "Каталог компаний по отраслям: авто, строительство, ремонт, перевозки и другие.",
  alternates: { canonical: `${siteUrl()}/catalogs` },
  openGraph: {
    title: "Каталоги компаний — Haliwali",
    description: "Найдите компании по категориям и городам России.",
    type: "website",
    url: `${siteUrl()}/catalogs`,
    siteName: "Haliwali",
  },
};

export default function CatalogsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
