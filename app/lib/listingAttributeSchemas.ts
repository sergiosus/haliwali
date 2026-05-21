/**
 * Central attribute schemas (Avito/Drom-style).
 * Each schema id maps to one product subcategory via exact slug in listingAttributeResolver.
 */

export type ListingAttributeFieldType = "text" | "number" | "select" | "boolean";

export type ListingAttributeFieldDef = {
  key: string;
  label: string;
  type: ListingAttributeFieldType;
  options?: readonly string[];
  placeholder?: string;
  unit?: string;
  /** Select filterable via `<datalist>`. */
  searchable?: boolean;
  /** Optional UI section label (same schema). */
  group?: string;
};

export type ListingAttributeSchemaId =
  | "automobiles"
  | "motorcycles"
  | "bicycles"
  | "tires"
  | "wheels"
  | "auto_parts"
  | "batteries"
  | "special_vehicles"
  | "garages"
  | "apartments"
  | "houses"
  | "land_plots"
  | "children_clothing"
  | "clothing"
  | "computers"
  | "phones"
  | "appliances"
  | "business_equipment"
  | "strollers"
  | "pets_dogs"
  | "pets_cats"
  | "pets_rodents"
  | "pets_birds"
  | "pets_reptiles"
  | "pets_supplies"
  | "generic";

export type ListingAttributeSchema = {
  id: ListingAttributeSchemaId;
  title: string;
  fields: readonly ListingAttributeFieldDef[];
};

export type ListingAttributes = Record<string, string | number | boolean>;

const CONDITION = ["Новое", "Как новое", "Б/у", "На запчасти"] as const;
const YEAR_OPTIONS = Array.from({ length: 57 }, (_, i) => String(new Date().getFullYear() - i));

const CAR_MAKES = [
  "Toyota",
  "Nissan",
  "Kia",
  "Hyundai",
  "Volkswagen",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Ford",
  "Renault",
  "Lada",
  "Chevrolet",
  "Mitsubishi",
  "Mazda",
  "Honda",
  "Skoda",
  "Opel",
  "УАЗ",
  "ГАЗ",
  "Другое",
] as const;

const PHONE_BRANDS = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "Huawei",
  "Honor",
  "Realme",
  "Google",
  "OnePlus",
  "Nokia",
  "Другое",
] as const;

const PC_BRANDS = [
  "Apple",
  "ASUS",
  "Lenovo",
  "HP",
  "Dell",
  "Acer",
  "MSI",
  "Huawei",
  "Samsung",
  "Другое",
] as const;

const G_AUTO = "Автомобиль";
const G_BIKE = "Велосипед";
const G_TIRE = "Шины";
const G_FLAT = "Квартира";
const G_HOUSE = "Дом";
const G_GARAGE = "Гараж";
const G_LAND = "Участок";
const G_PHONE = "Телефон";
const G_PC = "Компьютер";
const G_CHILD = "Одежда";
const G_PET = "Питомец";
const G_MAIN = "Основное";
const G_PARTS = "Запчасти";

/** Fallback for categories without a dedicated schema. */
export const GENERIC_ATTRIBUTE_FIELDS: readonly ListingAttributeFieldDef[] = [
  { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_MAIN },
  { key: "brand", label: "Бренд / производитель", type: "text", placeholder: "Необязательно", group: G_MAIN },
  { key: "model", label: "Размер / модель", type: "text", placeholder: "Необязательно", group: G_MAIN },
];

export const LISTING_ATTRIBUTE_SCHEMAS: Record<ListingAttributeSchemaId, ListingAttributeSchema> = {
  automobiles: {
    id: "automobiles",
    title: "Автомобиль",
    fields: [
      { key: "make", label: "Марка", type: "select", searchable: true, options: [...CAR_MAKES], group: G_AUTO },
      { key: "model", label: "Модель", type: "text", placeholder: "Camry", group: G_AUTO },
      { key: "year", label: "Год выпуска", type: "select", options: YEAR_OPTIONS, group: G_AUTO },
      { key: "mileage", label: "Пробег", type: "number", unit: "км", placeholder: "50000", group: G_AUTO },
      {
        key: "transmission",
        label: "Коробка",
        type: "select",
        options: ["Механика", "Автомат", "Робот", "Вариатор"],
        group: G_AUTO,
      },
      {
        key: "fuel",
        label: "Топливо",
        type: "select",
        options: ["Бензин", "Дизель", "Газ", "Гибрид", "Электро"],
        group: G_AUTO,
      },
      {
        key: "drive",
        label: "Привод",
        type: "select",
        options: ["Передний", "Задний", "Полный"],
        group: G_AUTO,
      },
      { key: "engineVolume", label: "Объём двигателя", type: "number", unit: "л", placeholder: "2.0", group: G_AUTO },
      {
        key: "steeringWheel",
        label: "Руль",
        type: "select",
        options: ["Левый", "Правый"],
        group: G_AUTO,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_AUTO },
    ],
  },
  motorcycles: {
    id: "motorcycles",
    title: "Мотоцикл",
    fields: [
      { key: "make", label: "Марка", type: "select", searchable: true, options: [...CAR_MAKES], group: "Мото" },
      { key: "model", label: "Модель", type: "text", group: "Мото" },
      { key: "year", label: "Год выпуска", type: "select", options: YEAR_OPTIONS, group: "Мото" },
      { key: "mileage", label: "Пробег", type: "number", unit: "км", group: "Мото" },
      {
        key: "engineVolume",
        label: "Объём",
        type: "number",
        unit: "см³",
        placeholder: "600",
        group: "Мото",
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: "Мото" },
    ],
  },
  bicycles: {
    id: "bicycles",
    title: "Велосипед",
    fields: [
      {
        key: "bicycleType",
        label: "Тип",
        type: "select",
        options: ["Горный", "Дорожный", "Шоссейный", "Детский", "BMX", "Электровелосипед", "Другой"],
        group: G_BIKE,
      },
      { key: "wheelSize", label: "Размер колёс", type: "text", placeholder: '29", 700c', group: G_BIKE },
      { key: "frameSize", label: "Размер рамы", type: "text", placeholder: "M, 54 см", group: G_BIKE },
      {
        key: "brakeType",
        label: "Тормоза",
        type: "select",
        options: ["Дисковые", "Ободные", "Другие"],
        group: G_BIKE,
      },
      {
        key: "suspension",
        label: "Амортизация",
        type: "select",
        options: ["Жёсткая", "Передняя", "Полная"],
        group: G_BIKE,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_BIKE },
    ],
  },
  tires: {
    id: "tires",
    title: "Шины",
    fields: [
      { key: "width", label: "Ширина", type: "number", placeholder: "205", group: G_TIRE },
      { key: "height", label: "Профиль", type: "number", placeholder: "55", group: G_TIRE },
      { key: "diameter", label: "Диаметр", type: "number", placeholder: "16", group: G_TIRE },
      {
        key: "season",
        label: "Сезон",
        type: "select",
        options: ["Лето", "Зима", "Всесезонные"],
        group: G_TIRE,
      },
      { key: "studded", label: "Шипы", type: "boolean", group: G_TIRE },
      { key: "quantity", label: "Количество", type: "number", placeholder: "4", group: G_TIRE },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_TIRE },
    ],
  },
  apartments: {
    id: "apartments",
    title: "Квартира",
    fields: [
      {
        key: "rooms",
        label: "Комнат",
        type: "select",
        options: ["Студия", "1", "2", "3", "4+", "Не указано"],
        group: G_FLAT,
      },
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G_FLAT },
      { key: "floor", label: "Этаж", type: "number", group: G_FLAT },
      { key: "totalFloors", label: "Этажей в доме", type: "number", group: G_FLAT },
      {
        key: "renovation",
        label: "Ремонт",
        type: "select",
        options: ["Без ремонта", "Косметический", "Евро", "Дизайнерский"],
        group: G_FLAT,
      },
      {
        key: "balcony",
        label: "Балкон",
        type: "select",
        options: ["Нет", "Балкон", "Лоджия", "Два и более"],
        group: G_FLAT,
      },
      {
        key: "bathroomType",
        label: "Санузел",
        type: "select",
        options: ["Совмещённый", "Раздельный", "Два и более"],
        group: G_FLAT,
      },
    ],
  },
  houses: {
    id: "houses",
    title: "Дом",
    fields: [
      { key: "houseArea", label: "Площадь дома", type: "number", unit: "м²", group: G_HOUSE },
      { key: "landArea", label: "Площадь участка", type: "number", unit: "сот.", group: G_HOUSE },
      { key: "floors", label: "Этажей", type: "number", group: G_HOUSE },
      {
        key: "material",
        label: "Материал",
        type: "select",
        options: ["Кирпич", "Дерево", "Газобетон", "Монолит", "Другое"],
        group: G_HOUSE,
      },
      {
        key: "heating",
        label: "Отопление",
        type: "select",
        options: ["Центральное", "Газовое", "Электрическое", "Печное", "Нет"],
        group: G_HOUSE,
      },
      {
        key: "waterSupply",
        label: "Водоснабжение",
        type: "select",
        options: ["Центральное", "Скважина", "Колодец", "Нет"],
        group: G_HOUSE,
      },
    ],
  },
  garages: {
    id: "garages",
    title: "Гараж",
    fields: [
      { key: "area", label: "Площадь", type: "number", unit: "м²", group: G_GARAGE },
      {
        key: "type",
        label: "Тип",
        type: "select",
        options: ["Капитальный", "Металлический", "Бокс", "Парковочное место", "Подземный"],
        group: G_GARAGE,
      },
      {
        key: "security",
        label: "Охрана",
        type: "select",
        options: ["Нет", "Консьерж", "Видеонаблюдение", "Охрана 24/7"],
        group: G_GARAGE,
      },
      { key: "electricity", label: "Электричество", type: "boolean", group: G_GARAGE },
      { key: "pit", label: "Смотровая яма", type: "boolean", group: G_GARAGE },
      {
        key: "documents",
        label: "Документы",
        type: "select",
        options: ["Собственность", "Кооператив", "Аренда", "Не указано"],
        group: G_GARAGE,
      },
    ],
  },
  land_plots: {
    id: "land_plots",
    title: "Участок",
    fields: [
      { key: "landArea", label: "Площадь", type: "number", unit: "сот.", group: G_LAND },
      {
        key: "landPurpose",
        label: "Назначение",
        type: "select",
        options: ["ИЖС", "СНТ", "ЛПХ", "Коммерческое", "Сельхоз", "Другое"],
        group: G_LAND,
      },
      { key: "electricity", label: "Электричество", type: "boolean", group: G_LAND },
      { key: "gas", label: "Газ", type: "boolean", group: G_LAND },
      { key: "water", label: "Вода", type: "boolean", group: G_LAND },
    ],
  },
  phones: {
    id: "phones",
    title: "Телефон",
    fields: [
      { key: "brand", label: "Бренд", type: "select", searchable: true, options: [...PHONE_BRANDS], group: G_PHONE },
      {
        key: "storage",
        label: "Память",
        type: "select",
        options: ["32 ГБ", "64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ"],
        group: G_PHONE,
      },
      {
        key: "ram",
        label: "ОЗУ",
        type: "select",
        options: ["2 ГБ", "3 ГБ", "4 ГБ", "6 ГБ", "8 ГБ", "12 ГБ", "16 ГБ"],
        group: G_PHONE,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PHONE },
    ],
  },
  computers: {
    id: "computers",
    title: "Компьютер",
    fields: [
      { key: "brand", label: "Бренд", type: "select", searchable: true, options: [...PC_BRANDS], group: G_PC },
      {
        key: "cpu",
        label: "Процессор",
        type: "text",
        placeholder: "Intel Core i5, Ryzen 5…",
        group: G_PC,
      },
      {
        key: "ram",
        label: "ОЗУ",
        type: "select",
        options: ["4 ГБ", "8 ГБ", "16 ГБ", "32 ГБ", "64 ГБ"],
        group: G_PC,
      },
      {
        key: "storage",
        label: "Накопитель",
        type: "select",
        options: ["128 ГБ SSD", "256 ГБ SSD", "512 ГБ SSD", "1 ТБ SSD", "HDD + SSD"],
        group: G_PC,
      },
      { key: "gpu", label: "Видеокарта", type: "text", placeholder: "RTX 3060, встроенная…", group: G_PC },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PC },
    ],
  },
  children_clothing: {
    id: "children_clothing",
    title: "Детская одежда",
    fields: [
      {
        key: "gender",
        label: "Пол",
        type: "select",
        options: ["Мальчик", "Девочка", "Унисекс"],
        group: G_CHILD,
      },
      {
        key: "age",
        label: "Возраст",
        type: "select",
        options: ["0–1 год", "1–3 года", "3–7 лет", "7–12 лет", "12+ лет"],
        group: G_CHILD,
      },
      { key: "size", label: "Размер", type: "text", placeholder: "92, 104, 26…", group: G_CHILD },
      {
        key: "season",
        label: "Сезон",
        type: "select",
        options: ["Зима", "Демисезон", "Лето", "Всесезон"],
        group: G_CHILD,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_CHILD },
    ],
  },
  pets_dogs: {
    id: "pets_dogs",
    title: "Собака",
    fields: [
      { key: "breed", label: "Порода", type: "text", group: G_PET },
      { key: "age", label: "Возраст", type: "text", placeholder: "2 года", group: G_PET },
      { key: "sex", label: "Пол", type: "select", options: ["Самец", "Самка"], group: G_PET },
      { key: "vaccinated", label: "Привит", type: "boolean", group: G_PET },
    ],
  },
  pets_cats: {
    id: "pets_cats",
    title: "Кошка",
    fields: [
      { key: "breed", label: "Порода", type: "text", group: G_PET },
      { key: "age", label: "Возраст", type: "text", placeholder: "1 год", group: G_PET },
      { key: "sex", label: "Пол", type: "select", options: ["Самец", "Самка"], group: G_PET },
      { key: "vaccinated", label: "Привит", type: "boolean", group: G_PET },
    ],
  },
  pets_rodents: {
    id: "pets_rodents",
    title: "Грызун",
    fields: [
      { key: "breed", label: "Порода", type: "text", group: G_PET },
      { key: "age", label: "Возраст", type: "text", group: G_PET },
      { key: "sex", label: "Пол", type: "select", options: ["Самец", "Самка"], group: G_PET },
      { key: "vaccinated", label: "Привит", type: "boolean", group: G_PET },
    ],
  },
  pets_birds: {
    id: "pets_birds",
    title: "Птица",
    fields: [
      { key: "breed", label: "Вид / порода", type: "text", group: G_PET },
      { key: "age", label: "Возраст", type: "text", group: G_PET },
      { key: "sex", label: "Пол", type: "select", options: ["Самец", "Самка", "Не указано"], group: G_PET },
    ],
  },
  pets_reptiles: {
    id: "pets_reptiles",
    title: "Рептилия",
    fields: [
      { key: "breed", label: "Вид", type: "text", group: G_PET },
      { key: "age", label: "Возраст", type: "text", group: G_PET },
      { key: "sex", label: "Пол", type: "select", options: ["Самец", "Самка", "Не указано"], group: G_PET },
    ],
  },
  pets_supplies: {
    id: "pets_supplies",
    title: "Товары для животных",
    fields: [
      { key: "itemType", label: "Тип товара", type: "text", placeholder: "Корм, лежанка…", group: G_PET },
      { key: "brand", label: "Бренд", type: "text", group: G_PET },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PET },
    ],
  },
  auto_parts: {
    id: "auto_parts",
    title: "Запчасти",
    fields: [
      {
        key: "partType",
        label: "Тип",
        type: "select",
        options: ["Двигатель", "Кузов", "Ходовая", "Электрика", "Фильтры", "Другое"],
        group: G_PARTS,
      },
      { key: "brand", label: "Бренд / производитель", type: "text", group: G_PARTS },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PARTS },
    ],
  },
  batteries: {
    id: "batteries",
    title: "Аккумулятор",
    fields: [
      { key: "capacity", label: "Ёмкость", type: "number", unit: "А·ч", placeholder: "60", group: G_PARTS },
      { key: "voltage", label: "Напряжение", type: "number", unit: "В", placeholder: "12", group: G_PARTS },
      { key: "brand", label: "Бренд", type: "text", group: G_PARTS },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PARTS },
    ],
  },
  wheels: {
    id: "wheels",
    title: "Диски",
    fields: [
      { key: "diameter", label: "Диаметр", type: "number", placeholder: "16", group: G_PARTS },
      { key: "width", label: "Ширина", type: "number", placeholder: "6.5", group: G_PARTS },
      { key: "pcd", label: "Разболтовка", type: "text", placeholder: "5×114.3", group: G_PARTS },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_PARTS },
    ],
  },
  special_vehicles: {
    id: "special_vehicles",
    title: "Спецтехника",
    fields: [
      {
        key: "vehicleType",
        label: "Тип",
        type: "select",
        options: ["Погрузчик", "Экскаватор", "Трактор", "Прицеп", "Кран", "Другое"],
        group: "Спецтехника",
      },
      { key: "year", label: "Год выпуска", type: "select", options: YEAR_OPTIONS, group: "Спецтехника" },
      { key: "hours", label: "Моточасы", type: "number", placeholder: "1200", group: "Спецтехника" },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: "Спецтехника" },
    ],
  },
  clothing: {
    id: "clothing",
    title: "Одежда и обувь",
    fields: [
      {
        key: "gender",
        label: "Пол",
        type: "select",
        options: ["Женский", "Мужской", "Унисекс", "Детский"],
        group: G_MAIN,
      },
      { key: "size", label: "Размер", type: "text", placeholder: "M, 42, 27…", group: G_MAIN },
      { key: "brand", label: "Бренд", type: "text", placeholder: "Необязательно", group: G_MAIN },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_MAIN },
    ],
  },
  appliances: {
    id: "appliances",
    title: "Техника",
    fields: [
      { key: "brand", label: "Бренд", type: "text", group: G_MAIN },
      {
        key: "applianceType",
        label: "Тип",
        type: "select",
        options: ["Крупная", "Мелкая", "Климат", "Кухня", "Другое"],
        group: G_MAIN,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_MAIN },
    ],
  },
  business_equipment: {
    id: "business_equipment",
    title: "Оборудование",
    fields: [
      { key: "equipmentType", label: "Тип", type: "text", group: G_MAIN },
      { key: "year", label: "Год выпуска", type: "select", options: YEAR_OPTIONS, group: G_MAIN },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_MAIN },
    ],
  },
  strollers: {
    id: "strollers",
    title: "Коляска",
    fields: [
      { key: "brand", label: "Бренд", type: "text", group: G_CHILD },
      {
        key: "strollerType",
        label: "Тип",
        type: "select",
        options: ["Прогулочная", "Универсальная", "Коляска-трость", "Другая"],
        group: G_CHILD,
      },
      { key: "condition", label: "Состояние", type: "select", options: [...CONDITION], group: G_CHILD },
    ],
  },
  generic: {
    id: "generic",
    title: "Товар",
    fields: GENERIC_ATTRIBUTE_FIELDS,
  },
};

export const LISTING_ATTRIBUTE_SCHEMA_IDS = Object.keys(LISTING_ATTRIBUTE_SCHEMAS) as ListingAttributeSchemaId[];
