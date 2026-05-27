import Link from "next/link";

export function SeoCardMapButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-8 items-center rounded-full border border-black/12 bg-white px-3 text-xs font-medium text-black/65 shadow-sm transition-colors hover:border-black/20 hover:bg-black/[0.02] hover:text-black"
    >
      На карте
    </Link>
  );
}
