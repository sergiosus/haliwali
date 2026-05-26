import Link from "next/link";

type Props = {
  className?: string;
};

/** Muted legal note for public catalog pages (imported company data). */
export function CatalogLegalDisclaimer({ className = "" }: Props) {
  return (
    <p className={`text-xs leading-relaxed text-black/35 ${className}`.trim()}>
      Информация о компаниях может быть собрана из открытых источников. Если вы представитель компании и хотите
      изменить или удалить информацию —{" "}
      <Link href="/contact" className="text-black/45 underline decoration-black/20 hover:text-black/60">
        свяжитесь с нами
      </Link>
      .
    </p>
  );
}
