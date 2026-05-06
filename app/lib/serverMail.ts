import nodemailer from "nodemailer";

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

function smtpUrl(): string {
  const raw = (process.env.SMTP_URL ?? "").trim();
  if (!raw) {
    throw new Error("SMTP_URL is not configured");
  }
  return raw;
}

function fromAddress(): string {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  if (raw) return raw;
  // Safe default; must be overridden in production.
  return "no-reply@haliwali.local";
}

export async function sendMail(args: SendArgs): Promise<void> {
  const to = (args.to ?? "").trim();
  if (!to) throw new Error("BAD_TO");
  const transporter = nodemailer.createTransport(smtpUrl());
  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: args.subject,
    text: args.text,
  });
}

