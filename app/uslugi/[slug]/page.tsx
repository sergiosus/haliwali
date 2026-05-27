import { createSeoCategorySegmentPage } from "../../lib/createSeoCategoryPage";

export const dynamic = "force-dynamic";

const { generateMetadata, Page } = createSeoCategorySegmentPage("uslugi");

export { generateMetadata };
export default Page;
