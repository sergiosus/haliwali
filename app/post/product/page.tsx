"use client";

import type React from "react";
import { forwardRef, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Listing, ProductListing } from "../../lib/listings";
import { generateEditToken, useListingsStore } from "../../lib/listings";
import { moderateListing } from "../../lib/moderation";
import { categoryToSlug, productCategories } from "../../lib/categories";
import { russianCities } from "../../lib/directory";
import { ListingLocationSection } from "../../components/ListingLocationSection";
import {
  listingPhotoPrepareUserMessage,
  prepareListingPhotoForPicker,
} from "../../lib/uploadImagePrepare";
import { uploadFiles } from "../../lib/uploadClient";
import { ConsentCheckbox } from "../../components/ConsentCheckbox";
import { OkModal } from "../../components/OkModal";
import { getCurrentUserId, refreshAuthFromServer } from "../../lib/auth";
import { AuthContinueModal } from "../../components/AuthContinueModal";
import { isValidPhone, PHONE_VALIDATION_MESSAGE } from "../../lib/identity";
import { resolveRussiaCityRegionDisplay } from "../../lib/locationDisplay";
import {
  LOCATION_MESSAGES,
  type SelectedLocation,
  type SelectedLocationSource,
} from "../../lib/selectedLocation";

type PostPageLocationPublishExtras = {
  region?: string;
  displayName?: string;
  source?: SelectedLocationSource;
};
import { isUploadFail } from "../../lib/uploadClient";
import { listingsSubmitUserMessage } from "../../lib/listings";

type ProductKind = "Продам" | "Куплю";

export default function PostProductPage() {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const { addListing, findByEditToken } = useListingsStore();
  const [formKey, setFormKey] = useState(0);
  const [okOpen, setOkOpen] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const pendingSubmitRef = useRef<null | (() => void)>(null);

  const submitTokenRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  async function addProduct(
    form: {
      kind: ProductKind;
      title: string;
      description: string;
      categoryName: (typeof productCategories)[number];
      price: number;
      city: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      phone: string;
      photos: string[];
    } & PostPageLocationPublishExtras,
  ) {
    if (submittedRef.current) return;

    const userId = getCurrentUserId();
    if (!userId) {
      return;
    }

    const moderation = moderateListing({
      title: form.title,
      description: form.description,
      phone: form.phone,
      city: form.city,
      categoryName: form.categoryName,
    });
    const editToken = submitTokenRef.current ?? generateEditToken();
    submitTokenRef.current = editToken;

    const existing = findByEditToken(editToken);
    if (existing) {
      submittedRef.current = true;
      return;
    }

    const hasGeo =
      typeof form.latitude === "number" &&
      typeof form.longitude === "number" &&
      Number.isFinite(form.latitude + form.longitude);

    const sellType = form.kind === "Продам" ? "product_sell" : "product_buy";

    const locNorm = resolveRussiaCityRegionDisplay(form.city ?? "", form.region ?? "");
    const displayLocation =
      (form.displayName ?? form.address ?? "").trim() || locNorm.displayName;

    const listing: ProductListing = {
      id: `product-${Date.now()}`,
      editToken,
      ownerId: userId,
      type: sellType,
      status: moderation.status,
      moderationReason: moderation.moderationReason ?? "",
      createdAt: Date.now(),
      photos: form.photos ?? [],
      title: form.title,
      description: form.description,
      categoryName: form.categoryName,
      categorySlug: categoryToSlug(form.categoryName, sellType),
      city: locNorm.city,
      address: displayLocation,
      latitude: hasGeo ? form.latitude : undefined,
      longitude: hasGeo ? form.longitude : undefined,
      phone: form.phone,
      price: form.price,
      location: form.city
        ? {
            city: locNorm.city,
            region: locNorm.region || undefined,
            displayName: displayLocation,
            address: form.address?.trim() || undefined,
            lat: hasGeo ? form.latitude : undefined,
            lng: hasGeo ? form.longitude : undefined,
            source: form.source,
          }
        : undefined,
    };
    await addListing(listing as Listing);
    submittedRef.current = true;

    submitTokenRef.current = null;
    submittedRef.current = false;
    setFormKey((k) => k + 1);
    setCreatedListingId(listing.id);
    setOkOpen(true);
  }

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[1000px] px-4 sm:px-6">
        <header className="flex items-center py-4">
          <Link href="/" className="text-sm text-black/60 hover:text-black">
            ← На главную
          </Link>
        </header>

        <main className="py-6 pb-16 md:py-8">
          <div className="mx-auto w-full max-w-[1150px]">
            <div className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
              <div className="text-lg font-medium md:text-xl">Разместить товар</div>
              <div className="mt-1 text-sm text-black/60">Заполните объявление — оно попадёт на проверку.</div>

              <div className="mt-4">
                <ProductPostForm
                  key={formKey}
                  titleRef={titleRef}
                  onSubmit={addProduct}
                  disabled={false}
                  onNeedAuth={(resume) => {
                    pendingSubmitRef.current = resume;
                    setAuthOpen(true);
                  }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      <AuthContinueModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          pendingSubmitRef.current?.();
          pendingSubmitRef.current = null;
        }}
      />

      <OkModal
        open={okOpen}
        title="Объявление отправлено на проверку"
        subtitle="После модерации оно появится на сайте."
        confirmLabel="Понятно"
        onClose={() => {
          setOkOpen(false);
          const id = createdListingId;
          setCreatedListingId(null);
          if (id) router.push(`/listing/${encodeURIComponent(id)}`);
          else router.push("/");
        }}
      />
    </div>
  );
}

function ProductPostForm({
  titleRef,
  onSubmit,
  onNeedAuth,
  disabled,
}: {
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (form: {
    kind: ProductKind;
    title: string;
    description: string;
    categoryName: (typeof productCategories)[number];
    price: number;
    city: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    phone: string;
    photos: string[];
  } & PostPageLocationPublishExtras) => void | Promise<void>;
  onNeedAuth: (resume: () => void) => void;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<ProductKind>("Продам");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState<(typeof productCategories)[number]>(productCategories[0]);
  const [price, setPrice] = useState<string>("");
  const [locationDraft, setLocationDraft] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    location?: string;
    phone?: string;
    categoryName?: string;
    consent?: string;
  }>({});
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleWrapRef = useRef<HTMLDivElement | null>(null);
  const descWrapRef = useRef<HTMLDivElement | null>(null);
  const locWrapRef = useRef<HTMLDivElement | null>(null);
  const phoneWrapRef = useRef<HTMLDivElement | null>(null);

  const wholeRussia = !selectedLocation;

  function scrollToFirstError(next: typeof errors) {
    const order: Array<keyof typeof next> = ["title", "description", "location", "phone", "categoryName", "consent"];
    const key = order.find((k) => Boolean(next[k]));
    const map: Partial<Record<keyof typeof next, React.RefObject<HTMLDivElement | null>>> = {
      title: titleWrapRef,
      description: descWrapRef,
      location: locWrapRef,
      phone: phoneWrapRef,
    };
    const ref = key ? map[key] : null;
    if (ref?.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || submitting) return;

        const nextErrors: typeof errors = {};
        if (title.trim().length < 4) nextErrors.title = "Минимум 4 символа";
        if (description.trim().length < 10) nextErrors.description = "Минимум 10 символов";
        if (!categoryName?.trim()) nextErrors.categoryName = "Выберите категорию";
        if (!wholeRussia && !selectedLocation) {
          nextErrors.location = LOCATION_MESSAGES.pickRequired;
        }
        if (!phone.trim()) nextErrors.phone = "Обязательное поле";
        else if (!isValidPhone(phone)) nextErrors.phone = PHONE_VALIDATION_MESSAGE;
        if (!consent) nextErrors.consent = "Необходимо дать согласие на обработку персональных данных";

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
          queueMicrotask(() => scrollToFirstError(nextErrors));
          return;
        }

        (async () => {
          const run = async () => {
            setSubmitError(null);
            setSubmitting(true);
            try {
              const urls = files.length > 0 ? await uploadFiles(files) : [];
              const wr = wholeRussia;
              await onSubmit({
                kind,
                title: title.trim(),
                description: description.trim(),
                categoryName,
                price: Number(price || 0),
                city: selectedLocation?.city ?? "",
                address: wr ? undefined : selectedLocation?.displayName ?? undefined,
                region: wr ? "Вся Россия" : selectedLocation?.region ?? "",
                displayName: wr ? "Вся Россия" : selectedLocation?.displayName ?? undefined,
                latitude: selectedLocation?.latitude,
                longitude: selectedLocation?.longitude,
                phone: phone.trim(),
                photos: urls,
                source: selectedLocation?.source ?? "suggestion",
              });
            } catch (err: unknown) {
              console.error(err);
              const e = err as unknown;
              if (isUploadFail(e)) {
                setSubmitError(e.message);
                return;
              }
              const fromApi = listingsSubmitUserMessage(err);
              if (fromApi) {
                setSubmitError(fromApi);
                return;
              }
              setSubmitError("Не удалось сохранить объявление. Попробуйте позже.");
            } finally {
              setSubmitting(false);
            }
          };

          if (!(await refreshAuthFromServer({ bypassCache: true }))) {
            onNeedAuth(() => {
              void run();
            });
            return;
          }

          await run();
        })();
      }}
    >
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Field label="Тип">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProductKind)}
            className="h-10 w-full appearance-none rounded-lg border border-black/15 bg-white px-4 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]"
            disabled={disabled || submitting}
          >
            <option value="Продам">Продам</option>
            <option value="Куплю">Куплю</option>
          </select>
        </Field>
        <Field label="Цена, ₽">
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            disabled={disabled || submitting}
          />
        </Field>
      </div>

      <div ref={titleWrapRef}>
        <Field label="Название товара">
        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={80}
          disabled={disabled || submitting}
          className={errors.title ? "border-red-300 focus:ring-red-200" : undefined}
        />
        <div className="mt-1 text-xs text-black/50">Минимум 4 символа</div>
        {errors.title ? <div className="mt-1 text-sm text-red-700">{errors.title}</div> : null}
        </Field>
      </div>

      <div ref={descWrapRef}>
        <Field label="Описание">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={800}
          className="min-h-[110px]"
          disabled={disabled || submitting}
        />
        <div className="mt-1 text-xs text-black/50">Минимум 10 символов</div>
        <div className="mt-1 text-xs text-black/50">
          Нельзя размещать ссылки, спам и финансовые услуги (кредиты, инвестиции и т.д.)
        </div>
        {errors.description ? <div className="mt-1 text-sm text-red-700">{errors.description}</div> : null}
        </Field>
      </div>

      <div className="max-w-xl">
        <Field label="Категория">
          <select
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value as (typeof productCategories)[number])}
            className={[
              "box-border h-[52px] w-full appearance-none rounded-xl bg-white px-4 text-sm leading-normal outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
              errors.categoryName ? "border border-red-300 focus:border-red-400" : "border border-black/15 focus:border-black/30",
            ].join(" ")}
            required
            disabled={disabled || submitting}
          >
            {productCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">
            {errors.categoryName ? <span className="text-red-700">{errors.categoryName}</span> : "\u00A0"}
          </div>
        </Field>
      </div>

      <div ref={locWrapRef} className="w-full">
        <ListingLocationSection
          draftText={locationDraft}
          onDraftTextChange={(v) => {
            setLocationDraft(v);
            setLocationMsg(null);
            if (errors.location) setErrors((p) => ({ ...p, location: undefined }));
          }}
          selectedLocation={selectedLocation}
          onSelectedLocationChange={(loc) => {
            setSelectedLocation(loc);
          }}
          cities={russianCities}
          onWholeRussiaPicked={() => {
            setLocationDraft("");
          }}
          disabled={disabled || submitting}
          onLocationMessage={setLocationMsg}
        />
        {locationMsg ? <div className="mt-2 text-sm text-red-700">{locationMsg}</div> : null}
        {errors.location ? <div className="mt-2 text-sm text-red-700">{errors.location}</div> : null}
      </div>

      <div ref={phoneWrapRef} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6">
        <Field label="Телефон">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="+90 555 123 45 67"
          disabled={disabled || submitting}
          className={errors.phone ? "border-red-300 focus:ring-red-200" : undefined}
        />
        <div className="mt-1 text-xs text-black/50">
          Телефон используется только для служебной связи и не показывается другим пользователям.
        </div>
        {errors.phone ? <div className="mt-1 text-sm text-red-700">{errors.phone}</div> : null}
        </Field>
        <div className="grid gap-1.5 pt-[2px]">
          <span className="text-sm font-medium leading-normal text-black/80">Фото</span>
          <p className="text-sm leading-relaxed text-black/55">
            До 10 изображений. Ниже можно выбрать файлы для объявления.
          </p>
        </div>
      </div>

      <Field label="Фото (до 10)" labelAsGroup>
        <FilePhotoPicker
          files={files}
          previews={previews}
          setFiles={setFiles}
          setPreviews={setPreviews}
        />
      </Field>

      <ConsentCheckbox
        checked={consent}
        onChange={(next) => {
          setConsent(next);
          if (errors.consent) setErrors((p) => ({ ...p, consent: undefined }));
        }}
        error={errors.consent}
        disabled={disabled || submitting}
      />

      <div className="mt-1 text-xs text-black/50">
        Запрещено публиковать мошеннические, незаконные и чужие персональные данные.
      </div>

      {submitError ? <div className="text-sm text-red-700">{submitError}</div> : null}

      <div className="mt-5 flex">
        <button
          type="submit"
          disabled={disabled || submitting}
          className={[
            "ml-auto h-10 w-full rounded-lg px-4 text-sm font-semibold text-black shadow-sm transition-colors md:w-auto",
            disabled || submitting ? "opacity-60" : "hover:brightness-95",
          ].join(" ")}
          style={{ backgroundColor: "#ff7a00" }}
        >
          {submitting ? "Отправляется..." : disabled ? "Отправлено" : "Отправить"}
        </button>
      </div>
    </form>
  );
}

function FilePhotoPicker({
  files,
  previews,
  setFiles,
  setPreviews,
}: {
  files: File[];
  previews: string[];
  setFiles: (next: File[]) => void;
  setPreviews: (next: string[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length === 0) return;
          setError(null);

          const remaining = Math.max(0, 10 - files.length);
          const nextFiles = picked.slice(0, remaining);
          if (picked.length > remaining) setError("Максимум 10 фото");

          try {
            const preparedFiles: File[] = [];
            const nextPreviews: string[] = [];
            for (const f of nextFiles) {
              const p = await prepareListingPhotoForPicker(f);
              preparedFiles.push(p.file);
              nextPreviews.push(p.objectUrl);
            }
            setFiles([...files, ...preparedFiles]);
            setPreviews([...previews, ...nextPreviews]);
          } catch (err) {
            setError(listingPhotoPrepareUserMessage(err));
          }
          e.currentTarget.value = "";
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-5 text-sm font-semibold text-black shadow-sm hover:bg-black/[0.03]"
        >
          Выбрать фото
        </button>
        <div className="grid gap-0.5 text-sm text-black/55">
          <span>Можно добавить до 10 фото</span>
          <span className="text-xs text-black/50">{previews.length} из 10 фото · JPG/PNG/WebP</span>
        </div>
      </div>

      {previews.length === 0 ? (
        <div className="space-y-1">
          <p className="text-sm text-black/45">Фото не выбраны</p>
          <p className="text-xs text-black/45">Необязательно — объявления с фото получают больше откликов.</p>
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {previews.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {previews.map((p, idx) => (
            <div
              key={`${idx}-${p.slice(0, 32)}`}
              className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-black/[0.04]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p}
                alt=""
                className="h-full w-full object-cover transition duration-150 ease-out group-hover:brightness-[0.88]"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  URL.revokeObjectURL(p);
                  setFiles(files.filter((_, i) => i !== idx));
                  setPreviews(previews.filter((_, i) => i !== idx));
                }}
                className="absolute right-1 top-1 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/95 text-black shadow-md ring-1 ring-black/10 transition-opacity duration-150 hover:bg-white sm:opacity-85 sm:group-hover:opacity-100"
                aria-label="Удалить фото"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  labelAsGroup,
}: {
  label: string;
  children: React.ReactNode;
  labelAsGroup?: boolean;
}) {
  const headingId = useId();
  if (labelAsGroup) {
    return (
      <div className="flex min-w-0 flex-col gap-0" role="group" aria-labelledby={headingId}>
        <span
          id={headingId}
          className="mb-2 block text-sm font-medium leading-normal text-black/80"
        >
          {label}
        </span>
        {children}
      </div>
    );
  }
  return (
    <label className="flex min-w-0 flex-col gap-0">
      <span className="mb-2 block text-sm font-medium leading-normal text-black/80">{label}</span>
      {children}
    </label>
  );
}

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  props,
  ref,
) {
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
        "w-full resize-y rounded-lg border border-black/15 bg-white px-4 py-3 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}



