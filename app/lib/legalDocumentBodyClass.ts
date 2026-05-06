/**
 * Typography scope for legal static pages (/terms, /about).
 * Pair with `.legal-document-body` rules in `globals.css` for reliable left alignment and line-height.
 */
export const legalDocumentBodyClass = [
  "legal-document-body mx-auto w-full max-w-[720px] space-y-8 text-left hyphens-none",
  "text-[15px] leading-[1.6] text-black/80 md:text-base",
  "[&_section]:space-y-3",
  "[&_p]:text-left [&_p]:leading-[1.6]",
  "[&_h2]:text-left",
].join(" ");
