import nodemailer from "nodemailer";
import { isDebugAuthServer } from "./debugAuth";
import {
  buildOtpFromHeader,
  isMailRuGroupDomain,
  logOtpEmailAccepted,
  logOtpEmailError,
  logOtpEmailMailRuGroup,
  logOtpEmailProvider,
  logOtpEmailRejected,
  logOtpEmailResponse,
  logOtpEmailStart,
  readOtpFromAlignmentLog,
  readOtpSmtpProviderLog,
  recipientDomainFromAddress,
  shouldSuppressOtpEmailDeliveryFailure,
  summarizeSendMailResult,
} from "./otpEmailDeliveryLog";

type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function smtpConfig() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const secureRaw = (process.env.SMTP_SECURE ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASSWORD ?? "").trim();

  if (!host) throw new Error("SMTP_HOST is not configured");
  const port = Number(portRaw || "587");
  if (!Number.isFinite(port) || port <= 0) throw new Error("SMTP_PORT is invalid");

  // Accept "true"/"false"/"1"/"0" and default to false (STARTTLS with 587).
  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0" || !secureRaw
        ? false
        : (() => {
            throw new Error("SMTP_SECURE is invalid");
          })();

  if (!user) throw new Error("SMTP_USER is not configured");
  if (!pass) throw new Error("SMTP_PASSWORD is not configured");

  return { host, port, secure, auth: { user, pass } };
}

function fromField(): string {
  return buildOtpFromHeader();
}

export async function sendEmail(
  args: SendEmailArgs,
): Promise<{ ok: true; status: "sent"; messageId?: string }> {
  const to = (args.to ?? "").trim();
  const subject = (args.subject ?? "").trim();
  const text = (args.text ?? "").trim();
  const html = (args.html ?? "").trim();
  if (!to) throw new Error("BAD_TO");

  const dbg = isDebugAuthServer();
  const recipientDomain = recipientDomainFromAddress(to);
  if (dbg) {
    console.log("[OTP_SEND] smtp env presence", {
      hostPresent: Boolean((process.env.SMTP_HOST ?? "").trim()),
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      userPresent: Boolean((process.env.SMTP_USER ?? "").trim()),
      passPresent: Boolean((process.env.SMTP_PASSWORD ?? "").trim()),
      fromPresent: Boolean((process.env.SMTP_FROM ?? "").trim()),
    });
  }

  const startedAt = Date.now();
  const fromHeader = fromField();
  logOtpEmailStart(recipientDomain);
  logOtpEmailProvider(readOtpSmtpProviderLog(), readOtpFromAlignmentLog(fromHeader));

  if (dbg) {
    console.log("[email][smtp] start", {
      recipientDomain,
      subjectLen: subject.length,
      textLen: text.length,
    });
  }

  try {
    if (dbg) console.log("[OTP_SEND] sendMail:before", { recipientDomain });
    const transporter = nodemailer.createTransport(smtpConfig());
    const info = await transporter.sendMail({
      from: fromHeader,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });

    const result = summarizeSendMailResult(info);
    logOtpEmailResponse(result);
    if (result.rejectedCount > 0) logOtpEmailRejected(result);
    if (result.acceptedCount > 0) logOtpEmailAccepted(result);

    if (isMailRuGroupDomain(recipientDomain)) {
      logOtpEmailMailRuGroup(recipientDomain, result.acceptedCount > 0);
    }

    if (shouldSuppressOtpEmailDeliveryFailure(recipientDomain, result)) {
      const messageId = result.messageId || undefined;
      if (dbg) {
        console.log("[email][smtp] sent", {
          recipientDomain,
          messageIdLen: messageId?.length ?? 0,
          elapsedMs: Date.now() - startedAt,
          suppressedDeliveryFailure: true,
        });
      }
      return { ok: true, status: "sent", ...(messageId ? { messageId } : {}) };
    }

    if (result.acceptedCount === 0) {
      throw new Error("SMTP did not accept email");
    }

    const messageId = result.messageId || undefined;
    if (dbg) {
      console.log("[email][smtp] sent", {
        recipientDomain,
        messageIdLen: messageId?.length ?? 0,
        elapsedMs: Date.now() - startedAt,
      });
    }
    return { ok: true, status: "sent", ...(messageId ? { messageId } : {}) };
  } catch (e) {
    logOtpEmailError({
      stage: "send-mail",
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
      code: (e as { code?: unknown }).code,
      command: (e as { command?: unknown }).command,
      response: (e as { response?: unknown }).response,
      responseCode: (e as { responseCode?: unknown }).responseCode,
    });
    throw e;
  }
}

// Backwards-compatible wrapper for existing flows.
export async function sendMail(args: SendEmailArgs): Promise<void> {
  await sendEmail(args);
}

