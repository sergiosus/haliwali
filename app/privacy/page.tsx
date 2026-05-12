import Link from "next/link";
import { BackNavButton } from "../components/BackNavButton";

const linkClass =
  "font-medium text-[#2563eb] underline underline-offset-2 hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/35";

export default function PrivacyPage() {
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
            <h1 className="text-2xl font-semibold tracking-tight text-black md:text-3xl">
              Политика конфиденциальности
            </h1>

            <p className="mt-3 text-[15px] leading-[1.7] text-black/70 md:text-base md:leading-[1.75]">
              Настоящая Политика описывает обработку персональных данных в сервисе Haliwali. Использование сайта также
              регулируется{" "}
              <Link href="/terms" className={linkClass}>
                Пользовательским соглашением
              </Link>
              .
            </p>

            <div className="mt-8 space-y-8 text-[15px] leading-[1.7] text-black/80 md:text-base md:leading-[1.75]">
              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">1. Какие данные мы обрабатываем</h2>
                <p className="text-black/75">
                  Мы обрабатываем данные в объёме, необходимом для работы платформы. К таким данным относятся:
                </p>
                <ul className="list-disc space-y-2 pl-5 marker:text-black/40">
                  <li>
                    <span className="font-medium text-black/90">Адрес электронной почты (email)</span> — для
                    регистрации, входа в аккаунт и восстановления доступа.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Номер телефона</span> — может собираться для служебных
                    целей: безопасность, поддержка, верификация, восстановление доступа.{" "}
                    <span className="font-medium text-black/90">
                      По умолчанию телефон скрыт от других пользователей
                    </span>{" "}
                    и не предназначен для публичного отображения.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Данные профиля</span> — например, имя или иные сведения,
                    которые вы указали добровольно (указание необязательно).
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Данные объявлений</span> — заголовок, описание,
                    категория, местоположение, цена и иные поля объявления, включая загружаемые изображения.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Сообщения в чате</span> — текст и служебные сведения,
                    связанные с перепиской внутри платформы.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Загружаемые файлы</span> — изображения и иные файлы,
                    которые вы прикрепляете к объявлениям или отправляете в чат (с учётом ограничений по типу и размеру).
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Технические данные</span> — в том числе IP-адрес,
                    файлы cookie и данные сессии, записи в журналах (логах) для обеспечения работы, безопасности и
                    диагностики сервиса.
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">2. Зачем мы обрабатываем данные</h2>
                <ul className="list-disc space-y-2 pl-5 marker:text-black/40">
                  <li>
                    <span className="font-medium text-black/90">Функционирование платформы</span> — публикация и
                    отображение объявлений, работа аккаунта и основных возможностей сервиса.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Коммуникация между пользователями</span> — чат и обмен
                    файлами внутри сервиса.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Безопасность и противодействие мошенничеству</span> —
                    модерация, выявление злоупотреблений, защита пользователей и инфраструктуры.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Обработка обращений</span> — ответы на запросы в
                    поддержку, в том числе через раздел{" "}
                    <Link href="/contact" className={linkClass}>
                      «Обратная связь»
                    </Link>
                    .
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">3. Использование файлов cookie</h2>
                <p>Сайт использует файлы cookie и аналогичные технологии для:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-black/40">
                  <li>обеспечения работы сайта (сессия, авторизация);</li>
                  <li>сохранения пользовательских настроек;</li>
                  <li>аналитики и улучшения работы сервиса.</li>
                </ul>
                <p>
                  Вы можете отключить cookie в настройках браузера, однако это может повлиять на корректную работу
                  сайта.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">4. Связь и интернет-аудиозвонки</h2>
                <ul className="list-disc space-y-2 pl-5 marker:text-black/40">
                  <li>
                    Общение между пользователями происходит внутри платформы: чат, обмен файлами и интернет-аудиозвонки.
                    Номера телефонов не показываются другим пользователям по умолчанию и не используются как основной
                    канал связи в сервисе.
                  </li>
                  <li>
                    Мы не отображаем телефон в объявлениях, чате, публичном профиле, SEO/метаданных и публичных ответах
                    API (если не будет введено явное разрешение пользователем в будущих версиях).
                  </li>
                  <li>
                    Для интернет-аудиозвонков может использоваться сторонний сервис{" "}
                    <span className="font-medium text-black/90">Jitsi</span>. Во время звонка аудиоданные могут
                    обрабатываться третьей стороной для обеспечения соединения.
                  </li>
                  <li>
                    <span className="font-medium text-black/90">Звонки не записываются</span> и{" "}
                    <span className="font-medium text-black/90">аудио не хранится</span> со стороны Haliwali.
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">5. Сторонние сервисы</h2>
                <p>
                  Для работы отдельных функций могут использоваться сторонние сервисы (например, карты, аудиозвонки),
                  которые могут обрабатывать технические данные.
                </p>
                <p className="text-black/75">
                  Рекомендуем ознакомиться с политиками конфиденциальности соответствующих поставщиков при использовании
                  таких функций.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">6. Загружаемые файлы</h2>
                <p>
                  Для безопасности мы ограничиваем типы и размер загружаемых файлов. Файлы могут проходить
                  автоматизированные проверки и модерацию. Не загружайте вредоносные или запрещённые материалы.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">7. Минимизация данных</h2>
                <p>
                  Мы стремимся собирать и хранить только те данные, которые необходимы для работы платформы: аккаунт,
                  объявления, сообщения в чате, файлы, а также технические данные для безопасности и стабильности.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">8. Хранение и территория</h2>
                <p>Персональные данные хранятся на серверах, расположенных на территории Российской Федерации.</p>
                <p className="text-black/75">
                  Обработка осуществляется с учётом требований законодательства Российской Федерации о персональных данных.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">9. Срок хранения</h2>
                <p>
                  Данные хранятся до достижения целей обработки или до удаления по запросу пользователя.
                </p>
                <p id="appendix-listing-deletion-data-retention">
                  При удалении объявления пользователем информация о нём может сохраняться в системе в течение
                  ограниченного периода времени (как правило, до 30 дней) для целей обеспечения безопасности,
                  предотвращения злоупотреблений, а также рассмотрения жалоб и споров. По истечении указанного срока
                  такие данные могут быть окончательно удалены.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">10. Удаление персональных данных</h2>
                <p>Пользователь вправе запросить удаление аккаунта и связанных с ним персональных данных.</p>
                <p>Удаление может быть выполнено немедленно либо с отсрочкой на 10 календарных дней.</p>
                <p>
                  При немедленном удалении персональные данные удаляются или обезличиваются без возможности восстановления,
                  за исключением данных, которые оператор обязан хранить в соответствии с законодательством Российской
                  Федерации.
                </p>
                <p>
                  При удалении с отсрочкой персональные данные временно сохраняются в течение 10 календарных дней
                  исключительно для возможности восстановления аккаунта и предотвращения случайного удаления.
                </p>
                <p>По истечении указанного срока персональные данные удаляются или обезличиваются.</p>
                <p>
                  Резервные копии данных могут временно содержать информацию, удалённую пользователем или администратором, до момента автоматической перезаписи архивов.
                </p>
                <p>
                  Такие резервные копии используются исключительно для обеспечения безопасности, восстановления работоспособности сервиса, предотвращения потери данных, расследования злоупотреблений и рассмотрения обращений пользователей.
                </p>
                <p>
                  При удалении аккаунта персональные данные могут быть переведены в режим ограниченного хранения на срок до 10 календарных дней с возможностью восстановления аккаунта пользователем или администратором сервиса.
                </p>
                <p>
                  После истечения указанного срока данные удаляются либо обезличиваются, за исключением случаев, когда их дальнейшее хранение требуется законодательством Российской Федерации либо необходимо для рассмотрения жалоб, предотвращения мошенничества и обеспечения безопасности платформы.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">11. Права пользователя</h2>
                <p className="text-black/75">В пределах, предусмотренных законодательством, вы можете:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-black/40">
                  <li>запросить информацию об обработке ваших данных;</li>
                  <li>потребовать уточнения (исправления) данных;</li>
                  <li>потребовать удаления данных.</li>
                </ul>
                <p className="text-black/75">
                  Для реализации прав удобно обратиться через{" "}
                  <Link href="/contact" className={linkClass}>
                    «Обратная связь»
                  </Link>
                  .
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">12. Безопасность</h2>
                <p>
                  Мы принимаем разумные меры для защиты данных, однако не можем гарантировать абсолютную безопасность
                  передачи и хранения информации в сети Интернет.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[17px] font-semibold text-black md:text-lg">13. Контакты</h2>
                <p>
                  Связаться с нами можно через{" "}
                  <Link href="/contact" className={linkClass}>
                    «Обратная связь»
                  </Link>
                  . Вопросы по конфиденциальности можно указать в тексте обращения.
                </p>
              </section>
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
