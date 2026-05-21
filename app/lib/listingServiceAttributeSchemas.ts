/**
 * Service listing attribute schemas (exact slug/name lookup in listingAttributeResolver).
 */

import type { ListingAttributeFieldDef } from "./listingAttributeSchemas";

const G = "Услуга";

export type ListingServiceSchemaId =
  | "service_generic"
  | "service_autoservice"
  | "service_garage_rent"
  | "service_housing_rent"
  | "service_accounting"
  | "service_video"
  | "service_cctv"
  | "service_cargo"
  | "service_design"
  | "service_delivery"
  | "service_commercial_re"
  | "service_computers_it"
  | "service_cosmetology"
  | "service_manicure"
  | "service_marketing"
  | "service_massage"
  | "service_setup_it"
  | "service_nanny"
  | "service_finishing"
  | "service_hairdresser"
  | "service_home_help"
  | "service_ads"
  | "service_apartment_repair"
  | "service_appliance_repair"
  | "service_tutoring"
  | "service_realtor"
  | "service_websites"
  | "service_plumbing"
  | "service_caregiver"
  | "service_construction"
  | "service_cleaning"
  | "service_photo"
  | "service_tow"
  | "service_electric"
  | "service_lawyer";

export type ListingServiceSchema = {
  id: ListingServiceSchemaId;
  title: string;
  fields: readonly ListingAttributeFieldDef[];
};

export const GENERIC_SERVICE_FIELDS: readonly ListingAttributeFieldDef[] = [
  { key: "serviceType", label: "Тип услуги", type: "text", placeholder: "Кратко", group: G },
  { key: "experience", label: "Опыт", type: "text", placeholder: "3 года", group: G },
  {
    key: "onsiteOrRemote",
    label: "Формат",
    type: "select",
    options: ["На месте", "Удалённо", "Оба"],
    group: G,
  },
];

const TERM_OPTIONS = ["Посуточно", "Помесячно", "Долгосрочно", "Разово"] as const;
const FREQ_OPTIONS = ["Разово", "Еженедельно", "Ежемесячно", "Постоянно"] as const;
const FORMAT_OPTIONS = ["Очно", "Онлайн", "Выезд", "Оба"] as const;

export const LISTING_SERVICE_SCHEMAS: Record<ListingServiceSchemaId, ListingServiceSchema> = {
  service_generic: { id: "service_generic", title: "Услуга", fields: GENERIC_SERVICE_FIELDS },
  service_autoservice: {
    id: "service_autoservice",
    title: "Автосервис",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", placeholder: "ТО, ремонт…", group: G },
      {
        key: "vehicleType",
        label: "Тип авто",
        type: "select",
        options: ["Легковой", "Грузовой", "Мото", "Любой"],
        group: G,
      },
      { key: "warranty", label: "Гарантия", type: "boolean", group: G },
      { key: "mobileService", label: "Выездной сервис", type: "boolean", group: G },
    ],
  },
  service_garage_rent: {
    id: "service_garage_rent",
    title: "Аренда гаража",
    fields: [
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "term", label: "Срок", type: "select", options: [...TERM_OPTIONS], group: G },
      { key: "electricity", label: "Электричество", type: "boolean", group: G },
      {
        key: "security",
        label: "Охрана",
        type: "select",
        options: ["Нет", "Консьерж", "Видеонаблюдение", "Охрана 24/7"],
        group: G,
      },
    ],
  },
  service_housing_rent: {
    id: "service_housing_rent",
    title: "Аренда жилья",
    fields: [
      {
        key: "propertyType",
        label: "Тип",
        type: "select",
        options: ["Квартира", "Комната", "Дом", "Студия"],
        group: G,
      },
      {
        key: "rooms",
        label: "Комнат",
        type: "select",
        options: ["Студия", "1", "2", "3", "4+"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "term", label: "Срок", type: "select", options: [...TERM_OPTIONS], group: G },
    ],
  },
  service_accounting: {
    id: "service_accounting",
    title: "Бухгалтерия",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      {
        key: "businessType",
        label: "Тип бизнеса",
        type: "select",
        options: ["ИП", "ООО", "Самозанятый", "Физлицо", "Другое"],
        group: G,
      },
      { key: "remoteWork", label: "Удалённо", type: "boolean", group: G },
    ],
  },
  service_video: {
    id: "service_video",
    title: "Видео",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", placeholder: "Монтаж, съёмка…", group: G },
      { key: "duration", label: "Длительность", type: "text", placeholder: "1–2 часа", group: G },
      { key: "equipmentIncluded", label: "Оборудование включено", type: "boolean", group: G },
    ],
  },
  service_cctv: {
    id: "service_cctv",
    title: "Видеонаблюдение",
    fields: [
      {
        key: "objectType",
        label: "Объект",
        type: "select",
        options: ["Квартира", "Дом", "Офис", "Склад", "Другое"],
        group: G,
      },
      { key: "camerasCount", label: "Камер", type: "number", group: G },
      { key: "installationIncluded", label: "Монтаж включён", type: "boolean", group: G },
    ],
  },
  service_cargo: {
    id: "service_cargo",
    title: "Грузоперевозки",
    fields: [
      {
        key: "vehicleType",
        label: "Транспорт",
        type: "select",
        options: ["Легковой", "Газель", "Фура", "Другое"],
        group: G,
      },
      { key: "loadCapacity", label: "Грузоподъёмность", type: "text", placeholder: "до 1.5 т", group: G },
      { key: "movers", label: "Грузчики", type: "boolean", group: G },
      { key: "intercity", label: "Межгород", type: "boolean", group: G },
    ],
  },
  service_design: {
    id: "service_design",
    title: "Дизайн",
    fields: [
      {
        key: "designType",
        label: "Тип",
        type: "select",
        options: ["Графика", "Интерьер", "Логотип", "Презентация", "Другое"],
        group: G,
      },
      { key: "deadline", label: "Срок", type: "text", placeholder: "3–5 дней", group: G },
      { key: "sourceFiles", label: "Исходники от заказчика", type: "boolean", group: G },
    ],
  },
  service_delivery: {
    id: "service_delivery",
    title: "Доставка",
    fields: [
      {
        key: "deliveryType",
        label: "Тип",
        type: "select",
        options: ["Курьер", "Груз", "Еда", "Документы", "Другое"],
        group: G,
      },
      { key: "weightLimit", label: "Вес до", type: "text", placeholder: "до 20 кг", group: G },
      { key: "sameDay", label: "В день заказа", type: "boolean", group: G },
    ],
  },
  service_commercial_re: {
    id: "service_commercial_re",
    title: "Коммерческая недвижимость",
    fields: [
      {
        key: "propertyType",
        label: "Тип",
        type: "select",
        options: ["Офис", "Склад", "Торговое", "Производство", "Другое"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      {
        key: "dealType",
        label: "Сделка",
        type: "select",
        options: ["Аренда", "Продажа", "Услуга риелтора"],
        group: G,
      },
    ],
  },
  service_computers_it: {
    id: "service_computers_it",
    title: "Компьютеры",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      {
        key: "deviceType",
        label: "Устройство",
        type: "select",
        options: ["ПК", "Ноутбук", "Сеть", "Принтер", "Другое"],
        group: G,
      },
      { key: "onsite", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_cosmetology: {
    id: "service_cosmetology",
    title: "Косметология",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      {
        key: "gender",
        label: "Для кого",
        type: "select",
        options: ["Женщины", "Мужчины", "Унисекс"],
        group: G,
      },
      { key: "homeVisit", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_manicure: {
    id: "service_manicure",
    title: "Маникюр",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", placeholder: "Маникюр, педикюр…", group: G },
      {
        key: "coatingType",
        label: "Покрытие",
        type: "select",
        options: ["Гель-лак", "Обычный лак", "Наращивание", "Другое"],
        group: G,
      },
      { key: "homeVisit", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_marketing: {
    id: "service_marketing",
    title: "Маркетинг",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      {
        key: "platform",
        label: "Платформа",
        type: "select",
        options: ["Соцсети", "Контекст", "SEO", "Комплекс", "Другое"],
        group: G,
      },
      { key: "budget", label: "Бюджет", type: "text", placeholder: "от 10 000 ₽", group: G },
    ],
  },
  service_massage: {
    id: "service_massage",
    title: "Массаж",
    fields: [
      {
        key: "massageType",
        label: "Тип",
        type: "select",
        options: ["Классический", "Спортивный", "Расслабляющий", "Лечебный", "Другое"],
        group: G,
      },
      { key: "duration", label: "Длительность", type: "text", placeholder: "60 мин", group: G },
      { key: "homeVisit", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_setup_it: {
    id: "service_setup_it",
    title: "Настройка",
    fields: [
      {
        key: "deviceType",
        label: "Устройство",
        type: "select",
        options: ["ПК", "Ноутбук", "Телефон", "Роутер", "ТВ", "Другое"],
        group: G,
      },
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      { key: "onsite", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_nanny: {
    id: "service_nanny",
    title: "Няни",
    fields: [
      {
        key: "childAge",
        label: "Возраст ребёнка",
        type: "select",
        options: ["0–1 год", "1–3 года", "3–7 лет", "7–12 лет", "12+ лет"],
        group: G,
      },
      { key: "schedule", label: "График", type: "select", options: [...FREQ_OPTIONS], group: G },
      { key: "experience", label: "Опыт", type: "text", group: G },
    ],
  },
  service_finishing: {
    id: "service_finishing",
    title: "Отделка",
    fields: [
      {
        key: "workType",
        label: "Тип работ",
        type: "select",
        options: ["Штукатурка", "Покраска", "Обои", "Плитка", "Комплекс"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
  service_hairdresser: {
    id: "service_hairdresser",
    title: "Парикмахер",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      {
        key: "gender",
        label: "Для кого",
        type: "select",
        options: ["Женщины", "Мужчины", "Дети", "Унисекс"],
        group: G,
      },
      { key: "homeVisit", label: "Выезд", type: "boolean", group: G },
    ],
  },
  service_home_help: {
    id: "service_home_help",
    title: "Помощь по дому",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      { key: "frequency", label: "Частота", type: "select", options: [...FREQ_OPTIONS], group: G },
    ],
  },
  service_ads: {
    id: "service_ads",
    title: "Реклама",
    fields: [
      {
        key: "adType",
        label: "Тип",
        type: "select",
        options: ["Контекст", "Таргет", "Наружная", "Другое"],
        group: G,
      },
      {
        key: "platform",
        label: "Платформа",
        type: "select",
        options: ["Яндекс", "VK", "Telegram", "Другое"],
        group: G,
      },
    ],
  },
  service_apartment_repair: {
    id: "service_apartment_repair",
    title: "Ремонт квартир",
    fields: [
      {
        key: "workType",
        label: "Тип работ",
        type: "select",
        options: ["Косметический", "Капитальный", "Под ключ", "Отдельные работы"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
  service_appliance_repair: {
    id: "service_appliance_repair",
    title: "Ремонт техники",
    fields: [
      {
        key: "deviceType",
        label: "Техника",
        type: "select",
        options: ["Стиральная", "Холодильник", "Плита", "Телевизор", "Другое"],
        group: G,
      },
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      { key: "warranty", label: "Гарантия", type: "boolean", group: G },
    ],
  },
  service_tutoring: {
    id: "service_tutoring",
    title: "Репетиторы",
    fields: [
      { key: "subject", label: "Предмет", type: "text", group: G },
      { key: "format", label: "Формат", type: "select", options: [...FORMAT_OPTIONS], group: G },
      {
        key: "studentLevel",
        label: "Уровень",
        type: "select",
        options: ["Школа", "ЕГЭ/ОГЭ", "Вуз", "Взрослые"],
        group: G,
      },
    ],
  },
  service_realtor: {
    id: "service_realtor",
    title: "Риелтор",
    fields: [
      {
        key: "dealType",
        label: "Сделка",
        type: "select",
        options: ["Покупка", "Продажа", "Аренда"],
        group: G,
      },
      {
        key: "propertyType",
        label: "Тип объекта",
        type: "select",
        options: ["Квартира", "Дом", "Коммерческая", "Участок"],
        group: G,
      },
    ],
  },
  service_websites: {
    id: "service_websites",
    title: "Сайты",
    fields: [
      {
        key: "siteType",
        label: "Тип сайта",
        type: "select",
        options: ["Лендинг", "Корпоративный", "Интернет-магазин", "Другое"],
        group: G,
      },
      {
        key: "platform",
        label: "Платформа",
        type: "select",
        options: ["С нуля", "Tilda", "WordPress", "Другое"],
        group: G,
      },
      { key: "deadline", label: "Срок", type: "text", group: G },
    ],
  },
  service_plumbing: {
    id: "service_plumbing",
    title: "Сантехника",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "urgency", label: "Срочно", type: "boolean", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
  service_caregiver: {
    id: "service_caregiver",
    title: "Сиделки",
    fields: [
      { key: "schedule", label: "График", type: "select", options: [...FREQ_OPTIONS], group: G },
      { key: "experience", label: "Опыт", type: "text", group: G },
      { key: "medicalSkills", label: "Мед. навыки", type: "boolean", group: G },
    ],
  },
  service_construction: {
    id: "service_construction",
    title: "Строительство",
    fields: [
      {
        key: "workType",
        label: "Тип работ",
        type: "select",
        options: ["Фундамент", "Коробка", "Кровля", "Под ключ"],
        group: G,
      },
      {
        key: "objectType",
        label: "Объект",
        type: "select",
        options: ["Дом", "Баня", "Гараж", "Пристройка"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
    ],
  },
  service_cleaning: {
    id: "service_cleaning",
    title: "Уборка",
    fields: [
      {
        key: "cleaningType",
        label: "Тип уборки",
        type: "select",
        options: ["Поддерживающая", "Генеральная", "После ремонта", "Окна"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "frequency", label: "Частота", type: "select", options: [...FREQ_OPTIONS], group: G },
    ],
  },
  service_photo: {
    id: "service_photo",
    title: "Фото",
    fields: [
      {
        key: "shootType",
        label: "Тип съёмки",
        type: "select",
        options: ["Портрет", "Свадьба", "Товар", "Репортаж", "Другое"],
        group: G,
      },
      { key: "duration", label: "Длительность", type: "text", group: G },
      { key: "retouchIncluded", label: "Ретушь включена", type: "boolean", group: G },
    ],
  },
  service_tow: {
    id: "service_tow",
    title: "Эвакуатор",
    fields: [
      {
        key: "vehicleType",
        label: "Транспорт",
        type: "select",
        options: ["Легковой", "Кроссовер", "Грузовой", "Мото"],
        group: G,
      },
      { key: "distance", label: "Расстояние", type: "text", placeholder: "до 50 км", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  service_electric: {
    id: "service_electric",
    title: "Электрика",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "urgency", label: "Срочно", type: "boolean", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
  service_lawyer: {
    id: "service_lawyer",
    title: "Юрист",
    fields: [
      { key: "lawType", label: "Область права", type: "text", placeholder: "Семейное, трудовое…", group: G },
      {
        key: "consultationFormat",
        label: "Формат консультации",
        type: "select",
        options: [...FORMAT_OPTIONS],
        group: G,
      },
    ],
  },
};

/** Normalized service category title → schema id. */
export const SERVICE_CATEGORY_NAME_TO_SCHEMA_ID: Readonly<Record<string, ListingServiceSchemaId>> = {
  автосервис: "service_autoservice",
  "аренда гаражей": "service_garage_rent",
  "аренда жилья": "service_housing_rent",
  бухгалтерия: "service_accounting",
  видео: "service_video",
  видеонаблюдение: "service_cctv",
  грузоперевозки: "service_cargo",
  дизайн: "service_design",
  доставка: "service_delivery",
  "коммерческая недвижимость": "service_commercial_re",
  компьютеры: "service_computers_it",
  косметология: "service_cosmetology",
  маникюр: "service_manicure",
  маркетинг: "service_marketing",
  массаж: "service_massage",
  настройка: "service_setup_it",
  няни: "service_nanny",
  отделка: "service_finishing",
  парикмахер: "service_hairdresser",
  "помощь по дому": "service_home_help",
  реклама: "service_ads",
  "ремонт квартир": "service_apartment_repair",
  "ремонт техники": "service_appliance_repair",
  репетиторы: "service_tutoring",
  риелтор: "service_realtor",
  сайты: "service_websites",
  сантехника: "service_plumbing",
  сиделки: "service_caregiver",
  строительство: "service_construction",
  уборка: "service_cleaning",
  фото: "service_photo",
  эвакуатор: "service_tow",
  электрика: "service_electric",
  юрист: "service_lawyer",
  другое: "service_generic",
};
