import nodemailer from "nodemailer";

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
  const address = (process.env.SMTP_FROM ?? "").trim() || "no-reply@haliwali.local";
  const name = (process.env.SMTP_FROM_NAME ?? "").trim();
  // Nodemailer `from` accepts "Name <email>" or "email".
  return name ? `${name} <${address}>` : address;
}

export async function sendEmail(
  args: SendEmailArgs,
): Promise<{ ok: true; status: "sent"; messageId?: string }> {
  const to = (args.to ?? "").trim();
  const subject = (args.subject ?? "").trim();
  const text = (args.text ?? "").trim();
  const html = (args.html ?? "").trim();
  if (!to) throw new Error("BAD_TO");

  const startedAt = Date.now();
  const safeTo = to.includes("@")
    ? `${to.split("@")[0]?.slice(0, 2) ?? ""}***@${to.split("@")[1]}`
    : "***";

  console.log("[email][smtp] start", {
    to: safeTo,
    subjectLen: subject.length,
    textLen: text.length,
  });

  try {
    const transporter = nodemailer.createTransport(smtpConfig());
    const info = await transporter.sendMail({
      from: fromField(),
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });

    const messageId = typeof (info as any)?.messageId === "string" ? (info as any).messageId : undefined;
    console.log("[email][smtp] sent", {
      to: safeTo,
      messageId,
      elapsedMs: Date.now() - startedAt,
    });
    return { ok: true, status: "sent", ...(messageId ? { messageId } : {}) };
  } catch (e) {
    console.error("[email][smtp] failed", {
      to: safeTo,
      err: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - startedAt,
    });
    throw e;
  }
}

// Backwards-compatible wrapper for existing flows.
export async function sendMail(args: SendEmailArgs): Promise<void> {
  await sendEmail(args);
}

