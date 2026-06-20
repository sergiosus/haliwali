import Link from "next/link";
import type { CategoryGuideCta } from "../lib/categoryGuideCtas";

/** Matches homepage category row styling — not a DB category. */
export function CategoryGuideCtaCard({ cta }: { cta: CategoryGuideCta }) {
  return (
    <div className="rounded-md border border-[#ff7a00]/20 bg-[#fff8f3] px-2 py-2">
      <p className="text-[13px] font-medium leading-snug text-gray-800">{cta.title}</p>
      <Link
        href={cta.href}
        className="mt-1.5 inline-flex h-8 items-center rounded-full bg-[#ff7a00] px-3 text-xs font-semibold text-white hover:bg-[#f07000]"
      >
        {cta.buttonLabel}
      </Link>
    </div>
  );
}
