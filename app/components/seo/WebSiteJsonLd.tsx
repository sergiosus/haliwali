import { websiteJsonLd } from "../../lib/seoSchema";

export function WebSiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
    />
  );
}
