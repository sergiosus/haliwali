import type { CatalogSourceName } from "./catalogSourceOfferTypes";
import { SOURCE_OFFER_REJECT_LABELS, type SourceOfferRejectReason } from "./catalogSourceOfferValidation";

export type SourceOfferImportErrorCode =
  | SourceOfferRejectReason
  | "INVALID_URL"
  | "MISSING_URL"
  | "UNSUPPORTED_SOURCE"
  | "MISSING_TITLE"
  | "DUPLICATE_DRAFT"
  | "DUPLICATE_PUBLISHED"
  | "SANITIZE_FAILED";

export type SourceOfferImportError = {
  url: string;
  sourceName: CatalogSourceName | "";
  error: SourceOfferImportErrorCode;
  message: string;
};

export type SourceOfferImportOutcomeStatus = "created" | "duplicate" | "rejected" | "error";

export type SourceOfferImportOutcome = {
  url: string;
  status: SourceOfferImportOutcomeStatus;
  sourceName: CatalogSourceName | "";
  message: string;
  draftId?: number;
  parseWarning?: string;
};

export const SOURCE_OFFER_IMPORT_ERROR_LABELS: Record<SourceOfferImportErrorCode, string> = {
  ...SOURCE_OFFER_REJECT_LABELS,
  INVALID_URL: "Некорректный URL",
  MISSING_URL: "Не указан URL объявления",
  UNSUPPORTED_SOURCE: "Источник не поддерживается (нужен Avito, Drom, Youla или VK)",
  MISSING_TITLE: "Не удалось получить название объявления",
  DUPLICATE_DRAFT: "Уже есть в кандидатах",
  DUPLICATE_PUBLISHED: "Уже опубликовано",
  SANITIZE_FAILED: "Не удалось сохранить черновик",
};

export function sourceOfferImportError(
  url: string,
  sourceName: CatalogSourceName | "",
  error: SourceOfferImportErrorCode,
  message?: string,
): SourceOfferImportError {
  return {
    url,
    sourceName,
    error,
    message: message ?? SOURCE_OFFER_IMPORT_ERROR_LABELS[error],
  };
}
