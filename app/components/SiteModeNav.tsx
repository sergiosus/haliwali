"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top-level site mode: listings (default) vs B2B catalogs. */
export function SiteModeNav() {
  const pathname = usePathname();
  const isCatalog = pathname === "/catalogs" || pathname.startsWith("/catalogs/");

  const base =
    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-[13px]";
  const active = "bg-white text-black shadow-sm";
  const idle = "text-black/50 hover:text-black/75";

  return (
    <nav
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-gray-200 bg-gray-50 p-0.5"
      aria-label="Режим сайта"
    >
      <Link href="/" className={`${base} ${!isCatalog ? active : idle}`}>
        Объявления
      </Link>
      <Link href="/catalogs" className={`${base} ${isCatalog ? active : idle}`}>
        Каталоги
      </Link>
    </nav>
  );
}
