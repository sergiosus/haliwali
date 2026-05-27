import { createSeoCategorySegmentPage } from "../../lib/createSeoCategoryPage";

export const dynamic = "force-dynamic";

const { generateMetadata, Page } = createSeoCategorySegmentPage("tovary");

export { generateMetadata };
export default Page;
