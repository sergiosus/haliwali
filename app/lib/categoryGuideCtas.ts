/** UI-only guide cards — not listing categories. */

export type CategoryGuideCta = {
  title: string;
  buttonLabel: string;
  href: string;
};

/** Shown after «Авто и транспорт» subcategories (homepage + product browse). */
export const PRODUCT_AUTO_TRANSPORT_GUIDE_CTAS: CategoryGuideCta[] = [
  {
    title: "Не нашли транспорт?",
    buttonLabel: "Найти авто",
    href: "/category/uslugi-poisk-avto",
  },
  {
    title: "Не нашли запчасти?",
    buttonLabel: "Создать запрос",
    href: "/category/uslugi-podborka-zapchastey",
  },
  {
    title: "Нужен осмотр авто?",
    buttonLabel: "Заказать осмотр",
    href: "/category/uslugi-osmotr-avto-pered-pokupkoy",
  },
];

export const PRODUCT_AUTO_TRANSPORT_PARENT_SLUG = "tovary-avto-i-transport";
