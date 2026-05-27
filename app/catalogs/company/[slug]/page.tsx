import { redirect } from "next/navigation";
import { companyPublicPath } from "../../../lib/seoRoutes";

export const dynamic = "force-dynamic";

/** Legacy catalog company URL → canonical SEO route. */
export default async function CatalogCompanyRedirectPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  redirect(companyPublicPath(slug));
}
