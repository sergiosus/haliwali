import Link from "next/link";
import { getOftenSearchedLinks } from "../../lib/oftenSearched";

export function OftenSearchedLinks({ className = "" }: { className?: string }) {
  const links = getOftenSearchedLinks();
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-black/50 ${className}`}>
      <span className="text-black/40">Часто ищут:</span>
      {links.map((link, i) => (
        <span key={link.href} className="inline-flex items-center gap-2">
          {i > 0 ? <span className="text-black/20" aria-hidden="true">·</span> : null}
          <Link href={link.href} className="text-black/55 underline-offset-2 hover:text-[#ff7a00] hover:underline">
            {link.label}
          </Link>
        </span>
      ))}
    </div>
  );
}
