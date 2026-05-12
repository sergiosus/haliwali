import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const MAILRU_GROUP_DOMAINS = new Set(["mail.ru", "inbox.ru", "bk.ru", "list.ru", "internet.ru"]);

function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (!k) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function loadEnvIfNeeded() {
  const root = process.cwd();
  for (const f of [".env.local", ".env.production", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const parsed = parseDotenv(fs.readFileSync(p, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = String(v ?? "");
    }
  }
}

function recipientDomainFromAddress(address) {
  const trimmed = String(address ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "";
  return trimmed.slice(at + 1);
}

function domainFromMailbox(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/<([^>]+)>/);
  const address = (match?.[1] ?? trimmed).trim().toLowerCase();
  return recipientDomainFromAddress(address);
}

function domainsFromMailboxList(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values) {
    const domain = domainFromMailbox(value);
    if (domain) out.push(domain);
  }
  return out;
}

function readSmtpConfig() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const secureRaw = (process.env.SMTP_SECURE ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASSWORD ?? "").trim();
  const port = Number(portRaw || "587");
  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0" || !secureRaw
        ? false
        : false;
  if (!host) throw new Error("SMTP_HOST is not configured");
  if (!Number.isFinite(port) || port <= 0) throw new Error("SMTP_PORT is invalid");
  if (!user) throw new Error("SMTP_USER is not configured");
  if (!pass) throw new Error("SMTP_PASSWORD is not configured");
  return { host, port, secure, auth: { user, pass } };
}

function readFromHeader() {
  const address = (process.env.SMTP_FROM ?? "").trim() || "no-reply@haliwali.local";
  const name = (process.env.SMTP_FROM_NAME ?? "").trim();
  return name ? `${name} <${address}>` : address;
}

function summarizeSendMailResult(info) {
  const acceptedDomains = domainsFromMailboxList(info.accepted);
  const rejectedDomains = domainsFromMailboxList(info.rejected);
  const envelopeFrom = typeof info.envelope?.from === "string" ? info.envelope.from.trim() : "";
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

loadEnvIfNeeded();

const testEmail = (process.env.TEST_EMAIL ?? "").trim();
if (!testEmail) {
  console.error("TEST_EMAIL is required, e.g. TEST_EMAIL=example@mail.ru node scripts/test-otp-email-delivery.mjs");
  process.exit(2);
}

const recipientDomain = recipientDomainFromAddress(testEmail);
const smtp = readSmtpConfig();
const fromHeader = readFromHeader();

console.log("[OTP_EMAIL_PROVIDER]", {
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  authUserDomain: recipientDomainFromAddress(smtp.auth.user),
  smtpFromDomain: recipientDomainFromAddress((process.env.SMTP_FROM ?? "").trim()),
  mailFromDomain: recipientDomainFromAddress((process.env.MAIL_FROM ?? "").trim()) || undefined,
  fromHeaderDomain: domainFromMailbox(fromHeader),
});
console.log("[OTP_EMAIL_START]", { recipientDomain });

const transporter = nodemailer.createTransport(smtp);

try {
  await transporter.verify();
  const info = await transporter.sendMail({
    from: fromHeader,
    to: testEmail,
    subject: "Haliwali OTP delivery test",
    text: "This is a delivery test message from scripts/test-otp-email-delivery.mjs.",
  });
  const result = summarizeSendMailResult(info);
  console.log("[OTP_EMAIL_RESPONSE]", {
    response: result.response || undefined,
    messageId: result.messageId || undefined,
  });
  console.log("[OTP_EMAIL_ACCEPTED]", {
    acceptedDomains: result.acceptedDomains,
    acceptedCount: result.acceptedCount,
    messageId: result.messageId || undefined,
    envelopeFrom: result.envelopeFrom || undefined,
    envelopeToDomains: result.envelopeToDomains,
  });
  if (result.rejectedCount > 0) {
    console.log("[OTP_EMAIL_REJECTED]", {
      rejectedDomains: result.rejectedDomains,
      rejectedCount: result.rejectedCount,
    });
  }
  if (MAILRU_GROUP_DOMAINS.has(recipientDomain)) {
    console.warn("[OTP_EMAIL_MAILRU_GROUP]", {
      recipientDomain,
      accepted: result.acceptedCount > 0,
      note: "Mail.ru group recipient domain detected; check SPF/DKIM/DMARC/reputation if accepted but not delivered.",
    });
  }
  console.log("[OTP_EMAIL_TEST_SUMMARY]", {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    recipientDomain,
    acceptedDomains: result.acceptedDomains,
    rejectedDomains: result.rejectedDomains,
    messageId: result.messageId || undefined,
    response: result.response || undefined,
  });
  if (result.rejectedCount > 0 && result.acceptedCount === 0) {
    process.exit(1);
  }
} catch (e) {
  console.error("[OTP_EMAIL_ERROR]", {
    name: e instanceof Error ? e.name : undefined,
    message: e instanceof Error ? e.message : String(e),
    code: e?.code,
    command: e?.command,
    response: e?.response,
    responseCode: e?.responseCode,
  });
  process.exit(1);
}
