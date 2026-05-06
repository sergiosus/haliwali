export const REPORT_REASON_OPTIONS = [
  { key: "fraud", label: "Мошенничество" },
  { key: "prohibited", label: "Запрещённый товар/услуга" },
  { key: "spam", label: "Спам" },
  { key: "insults", label: "Оскорбления" },
  { key: "other", label: "Другое" },
] as const;

export type ReportReasonKey = (typeof REPORT_REASON_OPTIONS)[number]["key"];
