"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function MarketplaceBagIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 7h12l-1.2 11.5H7.2L6 7Z" />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
    </svg>
  );
}

/** Homepage hero — secondary discovery pill to /marketplaces (not header nav). */
export function HeroMarketplaceEntry({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const active = pathname === "/marketplaces";

  return (
    <div className={`group relative w-full sm:w-auto ${className}`}>
      <Link
        href="/marketplaces"
        title="Поиск товаров с внешних площадок"
        className={[
          "inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 sm:w-auto",
          active
            ? "border-[rgba(255,122,0,0.45)] bg-[rgba(255,122,0,0.22)] text-[#a84a00] shadow-[0_4px_16px_rgba(255,122,0,0.18)]"
            : "border-[rgba(255,122,0,0.28)] bg-[rgba(255,122,0,0.12)] text-[#c25a00] shadow-sm hover:border-[rgba(255,122,0,0.4)] hover:bg-[rgba(255,122,0,0.18)] hover:text-[#a84f00] hover:shadow-[0_6px_20px_rgba(255,122,0,0.16)] active:scale-[0.99]",
        ].join(" ")}
      >
        <MarketplaceBagIcon className="h-4 w-4 shrink-0 opacity-90" />
        <span className="whitespace-nowrap">Товары с маркетплейсов</span>
      </Link>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-20 w-max max-w-[240px] -translate-x-1/2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-center text-[11px] leading-snug text-black/55 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Поиск товаров с внешних площадок
      </span>
    </div>
  );
}
