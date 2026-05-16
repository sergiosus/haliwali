import type { Metadata } from "next";
import { categoryTitleFromSlug } from "../../lib/categoryDirectory";
import { siteUrl } from "../../lib/siteUrl";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const titlePart = categoryTitleFromSlug(slug) ?? slug;
  const url = `${siteUrl()}/category/${encodeURIComponent(slug)}`;
  const title = `${titlePart} — объявления, задачи, услуги и товары | Haliwali`;
  const description =
    `Смотрите объявления в категории «${titlePart}»: задачи, услуги и товары по России. ` +
    `Размещайте свои объявления бесплатно.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "Haliwali",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}

