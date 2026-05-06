import { BackNavButton } from "../components/BackNavButton";
import { legalDocumentBodyClass } from "../lib/legalDocumentBodyClass";

const linkClass =
  "font-medium text-[#2563eb] underline underline-offset-2 hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/35";

export default function AboutPage() {
  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <header className="flex items-center py-4">
          <BackNavButton className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="pb-16 pt-2 md:pb-20 md:pt-4">
          <article
            className={[
              "mx-auto w-full max-w-[1024px] rounded-2xl border border-black/[0.08] bg-white px-6 py-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]",
              "sm:px-8 sm:py-9 md:px-10 md:py-10",
            ].join(" ")}
          >
            <h1 className="text-2xl font-semibold tracking-tight text-black md:text-3xl">О сервисе Haliwali</h1>

            <div className={`mt-8 ${legalDocumentBodyClass}`}>
              <section className="space-y-3">
                <p>Haliwali — это онлайн-платформа для размещения объявлений и взаимодействия пользователей.</p>
                <p>
                  Сервис позволяет пользователям публиковать предложения, находить исполнителей, товары и услуги, а также
                  общаться друг с другом напрямую.
                </p>
                <p>
                  Haliwali не является стороной сделок и не участвует в расчетах между пользователями. Все договоренности
                  и расчеты осуществляются напрямую между участниками.
                </p>
                <p>
                  Сервис может использовать сторонние технологии и решения для обеспечения работы отдельных функций,
                  включая карты и средства коммуникации.
                </p>
                <p>Оператором сервиса является ООО «ГРИНЕКС ТРЕЙД».</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">Оператор сервиса</h2>
                <p className="whitespace-pre-line">
                  ООО «ГРИНЕКС ТРЕЙД»
                  {"\n"}ИНН: 1800047120
                  {"\n"}ОГРН: 1261800001583
                </p>
                <p>По вопросам работы сервиса:</p>
                <p>
                  <a href="mailto:info@grinextrade.ru" className={linkClass}>
                    info@grinextrade.ru
                  </a>
                </p>
              </section>
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
