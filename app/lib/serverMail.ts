type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
};

function mailerSendApiKey(): string {
  const raw = (process.env.MAILERSEND_API_KEY ?? "").trim();
  if (!raw) throw new Error("MAILERSEND_API_KEY is not configured");
  return raw;
}

function fromAddress(): string {
  const raw = (process.env.MAIL_FROM ?? "").trim();
  if (raw) return raw;
  // Safe default; must be overridden in production.
  return "no-reply@haliwali.local";
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: true; status: number; messageId?: string }> {
  const to = (args.to ?? "").trim();
  const subject = (args.subject ?? "").trim();
  const text = (args.text ?? "").trim();
  if (!to) throw new Error("BAD_TO");

  const startedAt = Date.now();

  const r = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mailerSendApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: { email: fromAddress() },
      to: [{ email: to }],
      subject,
      text,
    }),
  });

  const messageId =
    r.headers.get("x-message-id") ??
    r.headers.get("x-mailersend-message-id") ??
    r.headers.get("x-ms-message-id") ??
    undefined;

  if (!r.ok) {
    let bodyText = "";
    try {
      bodyText = await r.text();
    } catch {
      bodyText = "";
    }
    const snippet = bodyText.trim().slice(0, 1200);
    console.error("[email][mailersend] failed", {
      status: r.status,
      to,
      subjectLen: subject.length,
      textLen: text.length,
      messageId,
      body: snippet || undefined,
      elapsedMs: Date.now() - startedAt,
    });
    throw new Error(`MAILERSEND_FAILED_${r.status}`);
  }

  console.log("[email][mailersend] sent", {
    status: r.status,
    to,
    subjectLen: subject.length,
    textLen: text.length,
    messageId,
    elapsedMs: Date.now() - startedAt,
  });

  return { ok: true, status: r.status, ...(messageId ? { messageId } : {}) };
}

// Backwards-compatible wrapper for existing flows.
export async function sendMail(args: SendEmailArgs): Promise<void> {
  await sendEmail(args);
}

