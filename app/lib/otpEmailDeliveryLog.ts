import type SMTPTransport from "nodemailer/lib/smtp-transport";

const MAILRU_GROUP_DOMAINS = new Set(["mail.ru", "inbox.ru", "bk.ru", "list.ru", "internet.ru"]);

export type OtpSmtpProviderLog = {
  host: string;
  port: number;
  secure: boolean;
  authUserDomain: string;
};

export type OtpFromAlignmentLog = {
  smtpFrom: string;
  smtpFromDomain: string;
  mailFrom: string;
  mailFromDomain: string;
  authUser: string;
  authUserDomain: string;
  fromHeader: string;
  fromHeaderDomain: string;
  alignedFromAndAuth: boolean;
};

export type OtpSendMailResultLog = {
  messageId: string;
  acceptedDomains: string[];
  rejectedDomains: string[];
  acceptedCount: number;
  rejectedCount: number;
  response: string;
  envelopeFrom: string;
  envelopeToDomains: string[];
};

export function recipientDomainFromAddress(address: string): string {
  const trimmed = (address ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "";
  return trimmed.slice(at + 1);
}

export function isMailRuGroupDomain(domain: string): boolean {
  const normalized = (domain ?? "").trim().toLowerCase();
  return MAILRU_GROUP_DOMAINS.has(normalized);
}

function domainFromMailbox(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/<([^>]+)>/);
  const address = (match?.[1] ?? trimmed).trim().toLowerCase();
  return recipientDomainFromAddress(address);
}

function domainsFromMailboxList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    const domain = domainFromMailbox(value);
    if (domain) out.push(domain);
  }
  return out;
}

export function readOtpSmtpProviderLog(): OtpSmtpProviderLog {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const secureRaw = (process.env.SMTP_SECURE ?? "").trim();
  const port = Number(portRaw || "587");
  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0" || !secureRaw
        ? false
        : false;
  const authUser = (process.env.SMTP_USER ?? "").trim();
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    authUserDomain: recipientDomainFromAddress(authUser),
  };
}

export function readOtpFromAlignmentLog(fromHeader: string): OtpFromAlignmentLog {
  const smtpFrom = (process.env.SMTP_FROM ?? "").trim();
  const mailFrom = (process.env.MAIL_FROM ?? "").trim();
  const authUser = (process.env.SMTP_USER ?? "").trim();
  const smtpFromDomain = recipientDomainFromAddress(smtpFrom);
  const mailFromDomain = recipientDomainFromAddress(mailFrom);
  const authUserDomain = recipientDomainFromAddress(authUser);
  const fromHeaderDomain = domainFromMailbox(fromHeader);
  const alignedFromAndAuth = Boolean(
    smtpFromDomain && authUserDomain && smtpFromDomain === authUserDomain,
  );
  return {
    smtpFrom,
    smtpFromDomain,
    mailFrom,
    mailFromDomain,
    authUser,
    authUserDomain,
    fromHeader,
    fromHeaderDomain,
    alignedFromAndAuth,
  };
}

export function buildOtpFromHeader(): string {
  const address = (process.env.SMTP_FROM ?? "").trim() || "no-reply@haliwali.local";
  const name = (process.env.SMTP_FROM_NAME ?? "").trim();
  return name ? `${name} <${address}>` : address;
}

export function shouldSuppressOtpEmailDeliveryFailure(
  recipientDomain: string,
  result: OtpSendMailResultLog,
): boolean {
  if (!isMailRuGroupDomain(recipientDomain)) return false;
  if (result.rejectedDomains.includes(recipientDomain)) return true;
  return result.acceptedCount === 0;
}

export function summarizeSendMailResult(info: SMTPTransport.SentMessageInfo): OtpSendMailResultLog {
  const acceptedDomains = domainsFromMailboxList(info.accepted);
  const rejectedDomains = domainsFromMailboxList(info.rejected);
  const envelopeFrom =
    typeof info.envelope?.from === "string" ? info.envelope.from.trim() : "";
  const envelopeToDomains = domainsFromMailboxList(info.envelope?.to);
  return {
    messageId: typeof info.messageId === "string" ? info.messageId : "",
    acceptedDomains,
    rejectedDomains,
    acceptedCount: acceptedDomains.length,
    rejectedCount: rejectedDomains.length,
    response: typeof info.response === "string" ? info.response : "",
    envelopeFrom,
    envelopeToDomains,
  };
}

export function logOtpEmailStart(recipientDomain: string): void {
  console.log("[OTP_EMAIL_START]", { recipientDomain });
}

export function logOtpEmailProvider(provider: OtpSmtpProviderLog, alignment: OtpFromAlignmentLog): void {
  console.log("[OTP_EMAIL_PROVIDER]", {
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    authUserDomain: provider.authUserDomain,
    smtpFromDomain: alignment.smtpFromDomain,
    mailFromDomain: alignment.mailFromDomain || undefined,
    fromHeaderDomain: alignment.fromHeaderDomain,
    alignedFromAndAuth: alignment.alignedFromAndAuth,
  });
  if (!alignment.alignedFromAndAuth && alignment.smtpFromDomain && alignment.authUserDomain) {
    console.warn("[OTP_EMAIL_PROVIDER] From domain does not match authenticated SMTP user domain", {
      smtpFromDomain: alignment.smtpFromDomain,
      authUserDomain: alignment.authUserDomain,
    });
  }
}

export function logOtpEmailAccepted(result: OtpSendMailResultLog): void {
  console.log("[OTP_EMAIL_ACCEPTED]", {
    messageId: result.messageId || undefined,
    acceptedDomains: result.acceptedDomains,
    acceptedCount: result.acceptedCount,
    envelopeFrom: result.envelopeFrom || undefined,
    envelopeToDomains: result.envelopeToDomains,
  });
}

export function logOtpEmailRejected(result: OtpSendMailResultLog): void {
  console.warn("[OTP_EMAIL_REJECTED]", {
    rejectedDomains: result.rejectedDomains,
    rejectedCount: result.rejectedCount,
    messageId: result.messageId || undefined,
  });
}

export function logOtpEmailResponse(result: OtpSendMailResultLog): void {
  console.log("[OTP_EMAIL_RESPONSE]", {
    response: result.response || undefined,
    messageId: result.messageId || undefined,
  });
}

export function logOtpEmailMailRuGroup(recipientDomain: string, accepted: boolean): void {
  console.warn("[OTP_EMAIL_MAILRU_GROUP]", {
    recipientDomain,
    accepted,
    note: "Mail.ru group recipient domain detected; check SPF/DKIM/DMARC/reputation if accepted but not delivered.",
  });
}

export function logOtpEmailError(details: {
  stage: string;
  name?: string;
  message?: string;
  code?: unknown;
  command?: unknown;
  response?: unknown;
  responseCode?: unknown;
}): void {
  console.error("[OTP_EMAIL_ERROR]", {
    stage: details.stage,
    name: details.name,
    message: details.message,
    code: details.code,
    command: details.command,
    response: details.response,
    responseCode: details.responseCode,
  });
}
