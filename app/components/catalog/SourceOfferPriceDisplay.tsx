"use client";

import { displayVerifiedSourceOfferPrice } from "../../lib/catalogOfferPriceDiagnostics";

export function SourceOfferPriceDisplay({
  offer,
  className = "",
}: {
  offer: Pick<{ price?: string | null; priceAmount?: number | null; priceText?: string | null; rawPayload?: Record<string, unknown> }, "price" | "priceAmount" | "priceText" | "rawPayload">;
  className?: string;
}) {
  const label = displayVerifiedSourceOfferPrice(offer);
  if (label) {
    return <span className={["font-semibold text-black", className].filter(Boolean).join(" ")}>{label}</span>;
  }
  return (
    <span className={["text-xs text-black/40", className].filter(Boolean).join(" ")}>Цена уточняется</span>
  );
}
