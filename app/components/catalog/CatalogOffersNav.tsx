"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CATALOG_OFFERS_HUB_LABEL,
  CATALOG_OFFERS_SECTIONS,
  isCatalogCompaniesSection,
} from "../../lib/catalogOffersNav";

export function CatalogOffersNav() {
  const pathname = usePathname();

  const tabBase =
    "inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3.5 text-xs font-medium transition-colors sm:text-[13px]";
  const tabActive = "border-black/15 bg-black/[0.06] text-black shadow-sm";
  const tabIdle =
    "border-black/10 bg-white text-black/60 hover:border-black/15 hover:bg-black/[0.03] hover:text-black/80";

  return (
    <div className="border-b border-black/[0.06] bg-gradient-to-b from-[#fff8f3] to-white">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40">{CATALOG_OFFERS_HUB_LABEL}</p>
        <nav
          className="mt-2 flex min-w-0 flex-wrap items-center gap-2"
          aria-label="Разделы каталога предложений"
        >
          {CATALOG_OFFERS_SECTIONS.map((section) => {
            const active =
              section.slug === "companies"
                ? isCatalogCompaniesSection(pathname)
                : pathname === section.href || pathname.startsWith(`${section.href}/`);
            return (
              <Link
                key={section.slug}
                href={section.href}
                className={`${tabBase} ${active ? tabActive : tabIdle}`}
                aria-current={active ? "page" : undefined}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
