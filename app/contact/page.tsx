"use client";

import type React from "react";
import { forwardRef, useRef, useState } from "react";
import { ConsentCheckbox } from "../components/ConsentCheckbox";
import { BackNavButton } from "../components/BackNavButton";
import { isValidPhone, PHONE_VALIDATION_MESSAGE } from "../lib/identity";

function SuccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-5 shadow-xl sm:p-6">
        <div className="text-lg font-semibold tracking-tight">Сообщение отправлено</div>
        <div className="mt-2 text-sm text-black/60">
          Администратор сможет посмотреть его в панели управления.
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  const [errors, setErrors] = useState<{
    contact?: string;
    phone?: string;
    subject?: string;
    message?: string;
    consent?: string;
  }>({});
  const [successOpen, setSuccessOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[1000px] px-4 sm:px-6">
        <header className="flex items-center py-4">
          <BackNavButton className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="py-6 pb-16 md:py-8">
          <div className="mx-auto max-w-[720px]">
            <div className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
              <h1 className="text-lg font-medium md:text-xl">Обратная связь</h1>
              <p className="mt-1 text-sm text-black/60">
                Если у вас вопрос по объявлению, модерации, жалоба или предложение по сайту — напишите нам.
              </p>

              <form
                className="mt-5 grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submitting) return;

                  const nextErrors: typeof errors = {};
                  const contact = (email.trim() || phone.trim()).trim();
                  if (!contact) nextErrors.contact = "Укажите email или телефон для связи";
                  if (phone.trim() && !isValidPhone(phone))
                    nextErrors.phone = PHONE_VALIDATION_MESSAGE;
                  if (subject.trim().length < 3) nextErrors.subject = "Тема: минимум 3 символа";
                  if (message.trim().length < 10) nextErrors.message = "Сообщение: минимум 10 символов";
                  if (!consent) nextErrors.consent = "Необходимо дать согласие на обработку персональных данных";
                  setErrors(nextErrors);
                  if (Object.keys(nextErrors).length > 0) {
                    subjectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    return;
                  }

                  setSubmitError(null);
                  setSubmitting(true);
                  void (async () => {
                    try {
                      const res = await fetch("/api/contact/feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: name.trim(),
                          email: email.trim(),
                          phone: phone.trim(),
                          subject: subject.trim(),
                          message: message.trim(),
                        }),
                      });
                      const data = (await res.json().catch(() => ({}))) as { message?: string };
                      if (!res.ok) {
                        setSubmitError(
                          typeof data.message === "string" && data.message.trim()
                            ? data.message
                            : "Не удалось отправить. Попробуйте позже.",
                        );
                        return;
                      }
                      setSuccessOpen(true);
                    } catch {
                      setSubmitError("Не удалось отправить. Попробуйте позже.");
                    } finally {
                      setSubmitting(false);
                    }
                  })();
                }}
              >
                <Field label="Имя (необязательно)">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>

                <div className="grid gap-2">
                  <div className="text-xs text-black/50">
                    Укажите хотя бы один способ связи: Email или телефон
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Email">
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        inputMode="email"
                        className={errors.contact ? "border-red-300" : undefined}
                      />
                    </Field>
                    <Field label="Телефон">
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+43… или 8999…"
                        className={errors.contact || errors.phone ? "border-red-300" : undefined}
                      />
                    </Field>
                  </div>
                  {errors.contact ? <div className="text-sm text-red-700">{errors.contact}</div> : null}
                  {errors.phone ? <div className="text-sm text-red-700">{errors.phone}</div> : null}
                </div>

                <Field label="Тема">
                  <Input
                    ref={subjectRef}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    minLength={3}
                    className={errors.subject ? "border-red-300" : undefined}
                  />
                  <div className="mt-1 text-xs text-black/50">Минимум 3 символа</div>
                  {errors.subject ? <div className="mt-1 text-sm text-red-700">{errors.subject}</div> : null}
                </Field>

                <Field label="Сообщение">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={10}
                    className={errors.message ? "border-red-300" : undefined}
                  />
                  <div className="mt-1 text-xs text-black/50">Минимум 10 символов</div>
                  {errors.message ? <div className="mt-1 text-sm text-red-700">{errors.message}</div> : null}
                </Field>

                <ConsentCheckbox
                  checked={consent}
                  onChange={(next) => {
                    setConsent(next);
                    if (errors.consent) setErrors((p) => ({ ...p, consent: undefined }));
                  }}
                  error={errors.consent}
                  disabled={submitting}
                />

                {submitError ? <div className="text-sm text-red-700">{submitError}</div> : null}

                <div className="mt-2 flex">
                  <button
                    type="submit"
                    disabled={submitting}
                    className={[
                      "ml-auto h-10 w-full rounded-lg px-4 text-sm font-semibold text-black shadow-sm transition-colors md:w-auto",
                      submitting ? "opacity-60" : "hover:brightness-95",
                    ].join(" ")}
                    style={{ backgroundColor: "#ff7a00" }}
                  >
                    {submitting ? "Отправляется..." : "Отправить"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>

      <SuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          setName("");
          setEmail("");
          setPhone("");
          setSubject("");
          setMessage("");
          setConsent(false);
          setErrors({});
          setSubmitError(null);
        }}
      />
    </div>
  );
}

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={[
        "h-10 w-full rounded-lg border border-black/15 bg-white px-4 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
});

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[120px] w-full resize-y rounded-lg border border-black/15 bg-white px-4 py-3 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-black/80">{label}</span>
      {children}
    </label>
  );
}

