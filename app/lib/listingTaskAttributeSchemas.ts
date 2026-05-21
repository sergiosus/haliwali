/**
 * Task listing attribute schemas (exact slug/name lookup in listingAttributeResolver).
 */

import type { ListingAttributeFieldDef } from "./listingAttributeSchemas";

const G = "Задача";

export type ListingTaskSchemaId =
  | "task_generic"
  | "task_other"
  | "task_vacancies"
  | "task_waste_removal"
  | "task_loaders"
  | "task_delivery"
  | "task_internet_setup"
  | "task_courier"
  | "task_minor_repair"
  | "task_find_car"
  | "task_find_garage"
  | "task_find_housing"
  | "task_find_helper"
  | "task_pc_setup"
  | "task_moving"
  | "task_part_time"
  | "task_rent_search"
  | "task_find_contractor"
  | "task_event_help"
  | "task_phone_help"
  | "task_appliance_repair"
  | "task_handyman"
  | "task_plumbing"
  | "task_furniture_assembly"
  | "task_cleaning"
  | "task_electric";

export type ListingTaskSchema = {
  id: ListingTaskSchemaId;
  title: string;
  fields: readonly ListingAttributeFieldDef[];
};

export const GENERIC_TASK_FIELDS: readonly ListingAttributeFieldDef[] = [
  { key: "taskType", label: "Тип задачи", type: "text", placeholder: "Кратко", group: G },
  { key: "deadline", label: "Срок", type: "text", placeholder: "До пятницы", group: G },
  { key: "budget", label: "Бюджет", type: "text", placeholder: "До 5000 ₽", group: G },
  { key: "urgent", label: "Срочно", type: "boolean", group: G },
];

const SCHEDULE_OPTIONS = ["Полный день", "Частичная занятость", "Сменный", "Гибкий", "Разово"] as const;
const PAYMENT_OPTIONS = ["Почасовая", "Фикс", "По договорённости"] as const;
const TERM_OPTIONS = ["Посуточно", "Помесячно", "Долгосрочно", "Разово"] as const;
const FREQ_OPTIONS = ["Разово", "Еженедельно", "Ежемесячно", "Постоянно"] as const;
const ADDRESS_TYPE_OPTIONS = ["Дом", "Квартира", "Офис", "Склад", "Другое"] as const;
const DEVICE_OPTIONS = ["ПК", "Ноутбук", "Смартфон", "Планшет", "Роутер", "Другое"] as const;

export const LISTING_TASK_SCHEMAS: Record<ListingTaskSchemaId, ListingTaskSchema> = {
  task_generic: { id: "task_generic", title: "Задача", fields: GENERIC_TASK_FIELDS },
  task_other: {
    id: "task_other",
    title: "Другое",
    fields: [
      { key: "taskType", label: "Тип задачи", type: "text", group: G },
      { key: "deadline", label: "Срок", type: "text", group: G },
      { key: "budget", label: "Бюджет", type: "text", group: G },
    ],
  },
  task_vacancies: {
    id: "task_vacancies",
    title: "Вакансии",
    fields: [
      { key: "jobType", label: "Тип работы", type: "text", placeholder: "Официант, водитель…", group: G },
      { key: "schedule", label: "График", type: "select", options: [...SCHEDULE_OPTIONS], group: G },
      { key: "paymentType", label: "Оплата", type: "select", options: [...PAYMENT_OPTIONS], group: G },
      { key: "experience", label: "Опыт", type: "text", placeholder: "Не требуется", group: G },
    ],
  },
  task_waste_removal: {
    id: "task_waste_removal",
    title: "Вывезти мусор",
    fields: [
      {
        key: "wasteType",
        label: "Тип мусора",
        type: "select",
        options: ["Бытовой", "Строительный", "Мебель", "Техника", "Другое"],
        group: G,
      },
      { key: "volume", label: "Объём", type: "text", placeholder: "2 м³", group: G },
      { key: "floor", label: "Этаж", type: "number", group: G },
      { key: "elevator", label: "Есть лифт", type: "boolean", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  task_loaders: {
    id: "task_loaders",
    title: "Грузчики",
    fields: [
      { key: "workersCount", label: "Количество грузчиков", type: "number", group: G },
      { key: "hours", label: "Часов", type: "number", group: G },
      { key: "floor", label: "Этаж", type: "number", group: G },
      { key: "elevator", label: "Есть лифт", type: "boolean", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  task_delivery: {
    id: "task_delivery",
    title: "Доставка",
    fields: [
      {
        key: "deliveryType",
        label: "Тип доставки",
        type: "select",
        options: ["Курьер", "Грузовой", "Пешком", "Другое"],
        group: G,
      },
      { key: "weight", label: "Вес", type: "text", placeholder: "до 10 кг", group: G },
      {
        key: "fromAddressType",
        label: "Откуда",
        type: "select",
        options: [...ADDRESS_TYPE_OPTIONS],
        group: G,
      },
      {
        key: "toAddressType",
        label: "Куда",
        type: "select",
        options: [...ADDRESS_TYPE_OPTIONS],
        group: G,
      },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  task_internet_setup: {
    id: "task_internet_setup",
    title: "Интернет и настройка",
    fields: [
      { key: "deviceType", label: "Устройство", type: "select", options: [...DEVICE_OPTIONS], group: G },
      { key: "workType", label: "Тип работ", type: "text", placeholder: "Wi‑Fi, роутер…", group: G },
      { key: "onsite", label: "На месте", type: "boolean", group: G },
    ],
  },
  task_courier: {
    id: "task_courier",
    title: "Курьер",
    fields: [
      {
        key: "deliveryType",
        label: "Тип доставки",
        type: "select",
        options: ["Документы", "Посылка", "Еда", "Другое"],
        group: G,
      },
      { key: "distance", label: "Расстояние", type: "text", placeholder: "до 5 км", group: G },
      { key: "sameDay", label: "В день заказа", type: "boolean", group: G },
    ],
  },
  task_minor_repair: {
    id: "task_minor_repair",
    title: "Мелкий ремонт",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "toolsRequired", label: "Нужны инструменты", type: "boolean", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  task_find_car: {
    id: "task_find_car",
    title: "Найти авто",
    fields: [
      {
        key: "vehicleType",
        label: "Тип авто",
        type: "select",
        options: ["Легковой", "Кроссовер", "Грузовой", "Мото", "Любой"],
        group: G,
      },
      { key: "budget", label: "Бюджет", type: "text", group: G },
      { key: "city", label: "Город", type: "text", group: G },
    ],
  },
  task_find_garage: {
    id: "task_find_garage",
    title: "Найти гараж",
    fields: [
      {
        key: "garageType",
        label: "Тип",
        type: "select",
        options: ["Бокс", "Парковка", "Подземный", "Капитальный"],
        group: G,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G },
      { key: "budget", label: "Бюджет", type: "text", group: G },
    ],
  },
  task_find_housing: {
    id: "task_find_housing",
    title: "Найти жильё",
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
      { key: "budget", label: "Бюджет", type: "text", group: G },
      { key: "term", label: "Срок", type: "select", options: [...TERM_OPTIONS], group: G },
    ],
  },
  task_find_helper: {
    id: "task_find_helper",
    title: "Найти помощника",
    fields: [
      { key: "helpType", label: "Тип помощи", type: "text", group: G },
      { key: "schedule", label: "График", type: "select", options: [...SCHEDULE_OPTIONS], group: G },
      { key: "experience", label: "Опыт", type: "text", group: G },
    ],
  },
  task_pc_setup: {
    id: "task_pc_setup",
    title: "Настроить ПК",
    fields: [
      { key: "deviceType", label: "Устройство", type: "select", options: [...DEVICE_OPTIONS], group: G },
      { key: "issueType", label: "Проблема", type: "text", placeholder: "Windows, вирусы…", group: G },
      { key: "onsite", label: "На месте", type: "boolean", group: G },
    ],
  },
  task_moving: {
    id: "task_moving",
    title: "Переезд",
    fields: [
      { key: "roomsCount", label: "Комнат", type: "number", group: G },
      { key: "moversNeeded", label: "Нужны грузчики", type: "boolean", group: G },
      { key: "truckNeeded", label: "Нужна машина", type: "boolean", group: G },
      { key: "floor", label: "Этаж", type: "number", group: G },
      { key: "elevator", label: "Есть лифт", type: "boolean", group: G },
    ],
  },
  task_part_time: {
    id: "task_part_time",
    title: "Подработка",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "schedule", label: "График", type: "select", options: [...SCHEDULE_OPTIONS], group: G },
      { key: "paymentType", label: "Оплата", type: "select", options: [...PAYMENT_OPTIONS], group: G },
    ],
  },
  task_rent_search: {
    id: "task_rent_search",
    title: "Поиск аренды",
    fields: [
      {
        key: "propertyType",
        label: "Тип",
        type: "select",
        options: ["Квартира", "Комната", "Дом", "Офис", "Склад", "Другое"],
        group: G,
      },
      { key: "budget", label: "Бюджет", type: "text", group: G },
      { key: "term", label: "Срок", type: "select", options: [...TERM_OPTIONS], group: G },
    ],
  },
  task_find_contractor: {
    id: "task_find_contractor",
    title: "Поиск исполнителя",
    fields: [
      { key: "serviceType", label: "Тип услуги", type: "text", group: G },
      { key: "deadline", label: "Срок", type: "text", group: G },
      { key: "budget", label: "Бюджет", type: "text", group: G },
    ],
  },
  task_event_help: {
    id: "task_event_help",
    title: "Помощь на мероприятиях",
    fields: [
      { key: "eventType", label: "Тип мероприятия", type: "text", placeholder: "Свадьба, корпоратив…", group: G },
      { key: "date", label: "Дата", type: "text", group: G },
      { key: "peopleCount", label: "Количество людей", type: "number", group: G },
    ],
  },
  task_phone_help: {
    id: "task_phone_help",
    title: "Помощь с телефоном",
    fields: [
      { key: "deviceType", label: "Устройство", type: "select", options: [...DEVICE_OPTIONS], group: G },
      { key: "issueType", label: "Проблема", type: "text", group: G },
      { key: "onsite", label: "На месте", type: "boolean", group: G },
    ],
  },
  task_appliance_repair: {
    id: "task_appliance_repair",
    title: "Починить технику",
    fields: [
      { key: "deviceType", label: "Устройство", type: "select", options: [...DEVICE_OPTIONS], group: G },
      { key: "issueType", label: "Проблема", type: "text", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
    ],
  },
  task_handyman: {
    id: "task_handyman",
    title: "Разнорабочий",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "hours", label: "Часов", type: "number", group: G },
      { key: "toolsRequired", label: "Нужны инструменты", type: "boolean", group: G },
    ],
  },
  task_plumbing: {
    id: "task_plumbing",
    title: "Сантехника",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
  task_furniture_assembly: {
    id: "task_furniture_assembly",
    title: "Собрать мебель",
    fields: [
      {
        key: "furnitureType",
        label: "Тип мебели",
        type: "select",
        options: ["Шкаф", "Кровать", "Стол", "Кухня", "Другое"],
        group: G,
      },
      { key: "itemsCount", label: "Количество предметов", type: "number", group: G },
      { key: "toolsRequired", label: "Нужны инструменты", type: "boolean", group: G },
    ],
  },
  task_cleaning: {
    id: "task_cleaning",
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
  task_electric: {
    id: "task_electric",
    title: "Электрика",
    fields: [
      { key: "workType", label: "Тип работ", type: "text", group: G },
      { key: "urgent", label: "Срочно", type: "boolean", group: G },
      { key: "materialsIncluded", label: "Материалы включены", type: "boolean", group: G },
    ],
  },
};

/** Normalized task category title → schema id. */
export const TASK_CATEGORY_NAME_TO_SCHEMA_ID: Readonly<Record<string, ListingTaskSchemaId>> = {
  вакансии: "task_vacancies",
  "вывезти мусор": "task_waste_removal",
  грузчики: "task_loaders",
  доставка: "task_delivery",
  "интернет и настройка": "task_internet_setup",
  курьер: "task_courier",
  "мелкий ремонт": "task_minor_repair",
  "найти авто": "task_find_car",
  "найти гараж": "task_find_garage",
  "найти жильё": "task_find_housing",
  "найти помощника": "task_find_helper",
  "настроить пк": "task_pc_setup",
  переезд: "task_moving",
  подработка: "task_part_time",
  "поиск аренды": "task_rent_search",
  "поиск исполнителя": "task_find_contractor",
  "помощь на мероприятиях": "task_event_help",
  "помощь с телефоном": "task_phone_help",
  "починить технику": "task_appliance_repair",
  разнорабочий: "task_handyman",
  сантехника: "task_plumbing",
  "собрать мебель": "task_furniture_assembly",
  уборка: "task_cleaning",
  электрика: "task_electric",
  другое: "task_other",
};
