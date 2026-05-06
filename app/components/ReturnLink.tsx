"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function ReturnLink({
  fallback,
  className,
}: {
  fallback: string;
  className?: string;
}) {
  const sp = useSearchParams();
  const ret = sp.get("return")?.trim() ?? "";
  const href = ret.startsWith("/") ? ret : fallback;
  return (
    <Link href={href} className={className}>
      ← Назад
    </Link>
  );
}
