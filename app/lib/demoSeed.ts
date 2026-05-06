import { categoryToSlug } from "./categories";

export type DemoSeedSpec =
  | {
      type: "task";
      title: string;
      description: string;
      categoryName: string;
    }
  | {
      type: "service";
      title: string;
      specialization: string;
      description: string;
      categoryName: string;
    }
  | {
      type: "product_sell" | "product_buy";
      title: string;
      description: string;
      categoryName: string;
      price: number;
    };

export const demoSeedSpecs: DemoSeedSpec[] = [
  // Tasks
  {
    type: "task",
    title: "Нужен мастер по стиралке",
    description: "Стиральная машина перестала сливать воду. Нужна диагностика и ремонт.",
    categoryName: "Нужен мастер",
  },
  {
    type: "task",
    title: "Требуется курьер",
    description: "Нужно забрать посылку и доставить по городу сегодня. Оплата по договорённости.",
    categoryName: "Доставка",
  },
  {
    type: "task",
    title: "Помощь по дому",
    description: "Нужно помочь собрать шкаф и повесить полку. Инструменты есть.",
    categoryName: "Помощь по дому",
  },
  {
    type: "task",
    title: "Разовое задание: разобрать кладовку",
    description: "Нужна помощь на 2–3 часа: разобрать вещи, вынести коробки, навести порядок.",
    categoryName: "Разовые задания",
  },
  {
    type: "task",
    title: "Срочно сегодня: повесить карниз",
    description: "Нужно повесить потолочный карниз, 2 крепления. Стена бетон.",
    categoryName: "Срочно сегодня",
  },
  {
    type: "task",
    title: "Другое: помощь с переездом",
    description: "Нужно помочь перенести несколько коробок и пару небольших шкафчиков.",
    categoryName: "Другое",
  },

  // Services
  {
    type: "service",
    title: "Ремонт холодильников",
    specialization: "Выезд, диагностика, ремонт",
    description: "Выезжаю по городу. Быстрая диагностика, замена деталей по согласованию.",
    categoryName: "Ремонт и строительство",
  },
  {
    type: "service",
    title: "Установка Windows",
    specialization: "Windows 10/11, драйверы, программы",
    description: "Поставлю Windows, настрою драйверы, установлю базовые программы. Быстро и аккуратно.",
    categoryName: "Компьютеры и техника",
  },
  {
    type: "service",
    title: "Уборка квартир",
    specialization: "Поддерживающая/генеральная уборка",
    description: "Уборка 1–3 комнат, санузел, кухня. Свои средства (по запросу).",
    categoryName: "Уборка",
  },
  {
    type: "service",
    title: "Перевозки и доставка",
    specialization: "Лёгкий груз, помощь с погрузкой",
    description: "Доставлю технику/мебель по городу. Возможна помощь с погрузкой.",
    categoryName: "Перевозки и доставка",
  },
  {
    type: "service",
    title: "Обучение: английский для начинающих",
    specialization: "Онлайн занятия",
    description: "Помогу подтянуть базу, разговорную практику и домашние задания.",
    categoryName: "Обучение",
  },
  {
    type: "service",
    title: "Другое: мелкий ремонт по дому",
    specialization: "Сборка, крепёж, мелкие работы",
    description: "Соберу мебель, повешу полку, настрою двери/петли. Оплата по объёму.",
    categoryName: "Другое",
  },

  // Products
  {
    type: "product_sell",
    title: "iPhone 12",
    description: "64GB, без ремонтов, работает отлично. Комплект по договорённости.",
    categoryName: "Телефоны и гаджеты",
    price: 28000,
  },
  {
    type: "product_sell",
    title: "Диван",
    description: "Удобный диван, раскладывается. Самовывоз.",
    categoryName: "Мебель и дом",
    price: 9000,
  },
  {
    type: "product_sell",
    title: "Стиральная машина",
    description: "Рабочая, есть косметические следы. Самовывоз.",
    categoryName: "Бытовая техника",
    price: 12000,
  },
  {
    type: "product_buy",
    title: "Куплю рабочий ноутбук",
    description: "Рассмотрю варианты до 25k. Важно: батарея и зарядка в комплекте.",
    categoryName: "Компьютеры и техника",
    price: 25000,
  },
  {
    type: "product_sell",
    title: "Кроссовки (почти новые)",
    description: "Размер 42. Надевались пару раз, состояние отличное.",
    categoryName: "Одежда и обувь",
    price: 3000,
  },
  {
    type: "product_sell",
    title: "Другое: отдам коробки бесплатно",
    description: "Картонные коробки после переезда. Самовывоз.",
    categoryName: "Другое",
    price: 0,
  },
];

export function demoCategorySlug(spec: DemoSeedSpec) {
  return categoryToSlug(
    spec.categoryName,
    spec.type === "product_sell" || spec.type === "product_buy" ? "product_sell" : spec.type,
  );
}

