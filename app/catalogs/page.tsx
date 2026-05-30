import { redirect } from "next/navigation";
import { CATALOG_OFFERS_HUB_HREF } from "../lib/catalogOffersNav";

/** Legacy `/catalogs` → companies section (current catalog home). */
export default function CatalogsRootPage() {
  redirect(CATALOG_OFFERS_HUB_HREF);
}
