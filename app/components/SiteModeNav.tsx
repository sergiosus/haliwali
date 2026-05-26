"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top-level site mode: listings (default) vs B2B catalogs. */
export function SiteModeNav() {
  const pathname = usePathname();
  const isCatalog = pathname === "/catalogs" || pathname.startsWith("/catalogs/");

  const base =
    "inline-flex h-9 items-center justify-center rounded-full border px-3.5 text-xs font-medium transition-colors sm:text-[13px]";
  const active = "border-black/15 bg-black/[0.06] text-black shadow-sm";
  const idle = "border-black/10 bg-white text-black/60 hover:border-black/15 hover:bg-black/[0.03] hover:text-black/80";

  return (
    <nav
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2"
      aria-label="Режим сайта"
    >
      <Link href="/" className={`${base} ${!isCatalog ? active : idle}`}>
        Объявления
      </Link>
      <Link href="/catalogs" className={`${base} ${isCatalog ? active : idle}`}>
        Каталоги компаний
      </Link>
    </nav>
  );
}
