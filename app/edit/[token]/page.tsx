"use client";

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams } from "next/navigation";
import type { Listing } from "../../lib/listings";
import { useListingsStore } from "../../lib/listings";
import { categoryToSlug, productCategories, serviceCategories, taskCategories } from "../../lib/categories";
import { russianCities } from "../../lib/directory";
import { moderateListing } from "../../lib/moderation";
import { useAuth } from "../../lib/auth";
import { ListingLocationSection } from "../../components/ListingLocationSection";
import { isValidPhone, PHONE_VALIDATION_MESSAGE } from "../../lib/identity";
import { resolveRussiaCityRegionDisplay } from "../../lib/locationDisplay";
import { LOCATION_MESSAGES, type SelectedLocation } from "../../lib/selectedLocation";
import {
  listingPhotoPrepareUserMessage,
  prepareListingPhotoForPicker,
} from "../../lib/uploadImagePrepare";
import { isUploadFail, uploadFiles } from "../../lib/uploadClient";

/** Saved gallery URL vs local file queued for upload (preview via `objectUrl` only — never persisted). */
type EditPhotoSlot =
  | { kind: "saved"; url: string }
  | { kind: "pending"; file: File; objectUrl: string };

function photosDirty(slots: EditPhotoSlot[], baselinePhotos: string[]): boolean {
  if (slots.some((s) => s.kind === "pending")) return true;
  const urls = slots.filter((s): s is { kind: "saved"; url: string } => s.kind === "saved").map((s) => s.url);
  if (urls.length !== baselinePhotos.length) return true;
  for (let i = 0; i < urls.length; i++) {
    if (urls[i] !== baselinePhotos[i]) return true;
  }
  return false;
}
export default function EditPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const auth = useAuth();
  const { loaded, findByEditToken, updateListing } = useListingsStore();

  const listing = useMemo(() => (token ? findByEditToken(token) : null), [findByEditToken, token]);

  if (!loaded) {
    return (
      <div className="min-h-full bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">Загрузка…</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-full bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <div className="rounded-3xl border border-black/10 bg-white p-6">
            <div className="text-lg font-semibold tracking-tight">Объявление не найдено</div>
            <div className="mt-2 text-sm text-black/60">
              Проверьте ссылку для редактирования.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (auth.status !== "ready") {
    return (
      <div className="min-h-full bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">Загрузка…</div>
      </div>
    );
  }

  const currentUserId = auth.userId ?? "";
  if (!currentUserId || listing.ownerId !== currentUserId) {
    return (
      <div className="min-h-full bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <div className="rounded-3xl border border-black/10 bg-white p-6">
            <div className="text-lg font-semibold tracking-tight">Объявление не найдено</div>
            <div className="mt-2 text-sm text-black/60">Проверьте ссылку для редактирования.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <EditForm
      listing={listing}
      onSave={async (next) => {
        await updateListing(listing.id, () => next);
      }}
    />
  );
}

type FormBaseline = {
  title: string;
  description: string;
  categoryName: string;
  city: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  photos: string[];
};

function snapshotFromListing(l: Listing): FormBaseline {
  return {
    title: l.title.trim(),
    description: l.description.trim(),
    categoryName: l.categoryName.trim(),
    city: l.city.trim(),
    address: (l.address ?? "").trim(),
    latitude: l.latitude,
    longitude: l.longitude,
    phone: (l.phone ?? "").trim(),
    photos: [...(l.photos ?? [])],
  };
}

function EditForm({ listing, onSave }: { listing: Listing; onSave: (next: Listing) => void | Promise<void> }) {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [categoryName, setCategoryName] = useState(listing.categoryName);
  const [address, setAddress] = useState(
    ((listing.address ?? "").trim() || listing.city.trim()).trim(),
  );
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(() => {
    const c = listing.city.trim();
    if (!c) return null;
    const prevReg =
      typeof listing.location?.region === "string" ? listing.location.region.trim() : "";
    const merged = resolveRussiaCityRegionDisplay(c, prevReg);
    const rawAddr = (listing.address ?? "").trim();
    const displayFromLoc = (listing.location?.displayName ?? "").trim();
    const displayName =
      displayFromLoc || (rawAddr.includes(",") ? rawAddr : merged.displayName);
    const src = listing.location?.source;
    const source =
      src === "map" || src === "geolocation" || src === "suggestion" ? src : "suggestion";
    return {
      city: merged.city,
      region: merged.region,
      displayName,
      address: rawAddr || undefined,
      latitude: listing.latitude,
      longitude: listing.longitude,
      source,
    };
  });
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [phone, setPhone] = useState(listing.phone ?? "");
  const [photoSlots, setPhotoSlots] = useState<EditPhotoSlot[]>(() =>
    (listing.photos ?? []).map((url) => ({ kind: "saved" as const, url })),
  );
  const [baseline, setBaseline] = useState<FormBaseline>(() => snapshotFromListing(listing));

  const photoSlotsRef = useRef(photoSlots);
  photoSlotsRef.current = photoSlots;
  useEffect(() => {
    return () => {
      for (const s of photoSlotsRef.current) {
        if (s.kind === "pending") URL.revokeObjectURL(s.objectUrl);
      }
    };
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    location?: string;
    phone?: string;
    categoryName?: string;
  }>({});

  const wholeRussia = !selectedLocation;

  const isDirty = useMemo(() => {
    if (photosDirty(photoSlots, baseline.photos)) return true;
    return (
      title.trim() !== baseline.title ||
      description.trim() !== baseline.description ||
      categoryName.trim() !== baseline.categoryName ||
      (selectedLocation?.city ?? "").trim() !== baseline.city ||
      address.trim() !== baseline.address ||
      (selectedLocation?.latitude ?? undefined) !== baseline.latitude ||
      (selectedLocation?.longitude ?? undefined) !== baseline.longitude ||
      phone.trim() !== baseline.phone
    );
  }, [title, description, categoryName, address, selectedLocation, phone, photoSlots, baseline]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = window.setTimeout(() => setSaveSuccess(false), 2500);
    return () => window.clearTimeout(t);
  }, [saveSuccess]);

  const categoryOptions =
    listing.type === "task"
      ? taskCategories
      : listing.type === "service"
        ? serviceCategories
        : productCategories;

  return (
    <div className="min-h-full bg-white text-black">
      {saveSuccess ? (
        <div
          className="fixed right-5 top-5 z-[120] rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          Изменения сохранены
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1150px] px-4 sm:px-6 lg:px-8">
        <header className="py-8">
          <div className="text-lg font-semibold tracking-tight">Редактирование объявления</div>
          <div className="mt-2 text-sm text-black/60">
            Статус может измениться после повторной проверки:{" "}
            <span className="font-medium text-black">{statusRu(listing.status)}</span>
          </div>
        </header>

        <main className="pb-16">
          <div className="rounded-3xl border border-black/10 bg-white p-5 sm:p-6">
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSaving || !isDirty) return;

                const nextErrors: typeof errors = {};
                if (title.trim().length < 4) nextErrors.title = "Минимум 4 символа";
                if (description.trim().length < 10) nextErrors.description = "Минимум 10 символов";
                if (!categoryName.trim()) nextErrors.categoryName = "Выберите категорию";
                if (!wholeRussia && !selectedLocation) {
                  nextErrors.location = LOCATION_MESSAGES.pickRequired;
                }
                if (!phone.trim()) nextErrors.phone = "Обязательное поле";
                else if (!isValidPhone(phone)) nextErrors.phone = PHONE_VALIDATION_MESSAGE;
                setErrors(nextErrors);
                if (Object.keys(nextErrors).length > 0) return;

                setSaveError(false);
                setIsSaving(true);
                try {
                  await new Promise((r) => window.setTimeout(r, 0));

                  const existingUrls = photoSlots.filter((s) => s.kind === "saved").map((s) => s.url);
                  const pendingSlots = photoSlots.filter((s) => s.kind === "pending");
                  let uploadedUrls: string[] = [];
                  if (pendingSlots.length > 0) {
                    try {
                      uploadedUrls = await uploadFiles(pendingSlots.map((p) => p.file));
                    } catch (uploadErr) {
                      console.error("[edit listing] photo upload failed", uploadErr);
                      if (isUploadFail(uploadErr)) {
                        console.error("[edit listing] upload detail", {
                          status: uploadErr.status,
                          serverError: uploadErr.serverError,
                          message: uploadErr.message,
                        });
                      }
                      throw uploadErr;
                    }
                  }
                  const finalPhotos = [...existingUrls, ...uploadedUrls].slice(0, 10);

                  const locCityRaw = (selectedLocation?.city ?? "").trim();
                  const locMerged = wholeRussia
                    ? { city: "", region: "Вся Россия", displayName: "Вся Россия" }
                    : resolveRussiaCityRegionDisplay(locCityRaw, selectedLocation?.region ?? "");

                  const moderation = moderateListing({
                    title: title.trim(),
                    description: description.trim(),
                    phone: phone.trim(),
                    city: locMerged.city,
                    categoryName: categoryName.trim(),
                  });

                  const nextStatus =
                    moderation.status === "pending"
                      ? "pending"
                      : listing.status === "approved"
                        ? "approved"
                        : "auto";

                  const lat = selectedLocation?.latitude;
                  const lng = selectedLocation?.longitude;
                  const hasGeo =
                    typeof lat === "number" &&
                    typeof lng === "number" &&
                    Number.isFinite(lat) &&
                    Number.isFinite(lng);

                  const addrLine = wholeRussia
                    ? undefined
                    : (selectedLocation?.displayName ?? "").trim() ||
                      address.trim() ||
                      locMerged.displayName;

                  const next: Listing = {
                    ...listing,
                    title: title.trim(),
                    description: description.trim(),
                    categoryName: categoryName.trim(),
                    categorySlug: categoryToSlug(categoryName.trim(), listing.type),
                    city: locMerged.city,
                    address: addrLine || undefined,
                    latitude: hasGeo ? lat : undefined,
                    longitude: hasGeo ? lng : undefined,
                    phone: phone.trim(),
                    photos: finalPhotos,
                    status: nextStatus,
                    moderationReason: moderation.moderationReason ?? "",
                    location: wholeRussia
                      ? undefined
                      : {
                          city: locMerged.city,
                          region: locMerged.region || undefined,
                          displayName: addrLine,
                          address: address.trim() || undefined,
                          lat: hasGeo ? lat : undefined,
                          lng: hasGeo ? lng : undefined,
                          source: selectedLocation?.source,
                        },
                  } as Listing;

                  await Promise.resolve(onSave(next));

                  for (const s of photoSlots) {
                    if (s.kind === "pending") URL.revokeObjectURL(s.objectUrl);
                  }
                  setPhotoSlots((next.photos ?? []).map((url) => ({ kind: "saved" as const, url })));
                  setBaseline(snapshotFromListing(next));
                  setSaveSuccess(true);
                } catch (err) {
                  console.error("[edit listing] save failed", err);
                  setSaveError(true);
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              <Field label="Заголовок">
                <Input
                  value={title}
                  onChange={(e) => {
                    setSaveError(false);
                    setTitle(e.target.value);
                  }}
                  required
                  maxLength={80}
                  className={errors.title ? "border-red-300" : undefined}
                />
                <div className="mt-1 text-xs text-black/50">Минимум 4 символа</div>
                {errors.title ? <div className="mt-1 text-sm text-red-700">{errors.title}</div> : null}
              </Field>

              <Field label="Описание">
                <Textarea
                  value={description}
                  onChange={(e) => {
                    setSaveError(false);
                    setDescription(e.target.value);
                  }}
                  required
                  maxLength={800}
                  className="min-h-[140px]"
                />
                <div className="mt-1 text-xs text-black/50">Минимум 10 символов</div>
                <div className="mt-1 text-xs text-black/50">
                  Нельзя размещать ссылки, спам и финансовые услуги (кредиты, инвестиции и т.д.)
                </div>
                {errors.description ? <div className="mt-1 text-sm text-red-700">{errors.description}</div> : null}
              </Field>

              <div className="max-w-xl">
                <Field label="Категория">
                  <select
                    value={categoryName}
                    onChange={(e) => {
                      setSaveError(false);
                      setCategoryName(e.target.value);
                    }}
                    className="box-border h-[52px] w-full appearance-none rounded-xl border border-black/15 bg-white px-4 text-sm leading-normal outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]"
                    required
                  >
                    {categoryOptions.map((c) => (
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

              <div className="w-full">
                <ListingLocationSection
                  draftText={address}
                  onDraftTextChange={(v) => {
                    setSaveError(false);
                    setAddress(v);
                    setLocationMsg(null);
                    if (errors.location) setErrors((p) => ({ ...p, location: undefined }));
                  }}
                  selectedLocation={selectedLocation}
                  onSelectedLocationChange={(loc) => {
                    setSaveError(false);
                    setSelectedLocation(loc);
                  }}
                  wholeRussia={wholeRussia}
                  cities={russianCities}
                  onWholeRussiaPicked={() => {
                    setAddress("");
                  }}
                  disabled={isSaving}
                  onLocationMessage={setLocationMsg}
                />
                {locationMsg ? <div className="mt-2 text-sm text-red-700">{locationMsg}</div> : null}
                {errors.location ? <div className="mt-2 text-sm text-red-700">{errors.location}</div> : null}
              </div>

              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6">
                <Field label="Телефон">
                  <Input
                    value={phone}
                    onChange={(e) => {
                      setSaveError(false);
                      setPhone(e.target.value);
                    }}
                    required
                    className={errors.phone ? "border-red-300" : undefined}
                  />
                  <div className="mt-1 text-xs text-black/50">Обязательное поле</div>
                  {errors.phone ? <div className="mt-1 text-sm text-red-700">{errors.phone}</div> : null}
                </Field>
                <div className="grid gap-1.5 pt-[2px]">
                  <span className="text-sm font-medium leading-normal text-black/80">Фото</span>
                  <p className="text-sm leading-relaxed text-black/55">
                    До 10 изображений. Ниже можно изменить галерею объявления.
                  </p>
                </div>
              </div>

              <Field label="Фото (до 10)" labelAsGroup>
                <EditPhotos
                  photoSlots={photoSlots}
                  setPhotoSlots={(next) => {
                    setSaveError(false);
                    setPhotoSlots(next);
                  }}
                />
              </Field>

              <div className="mt-4 space-y-2">
                {saveError ? (
                  <div className="text-sm text-red-700">
                    Не удалось сохранить. Попробуйте ещё раз.
                  </div>
                ) : null}
                <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving || !isDirty}
                  className={[
                    "inline-flex h-11 min-w-[200px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-black shadow-sm transition-colors",
                    isSaving || !isDirty ? "cursor-not-allowed opacity-65" : "hover:brightness-95",
                  ].join(" ")}
                  style={{ backgroundColor: "#ff7a00" }}
                >
                  {isSaving ? (
                    <>
                      <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z"
                        />
                      </svg>
                      Сохранение...
                    </>
                  ) : !isDirty ? (
                    "Нет изменений"
                  ) : (
                    "Сохранить изменения"
                  )}
                </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

function statusRu(status: Listing["status"]) {
  if (status === "pending") return "На проверке";
  if (status === "auto" || status === "approved") return "Опубликовано";
  return "Отклонено";
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

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-2xl border border-black/15 bg-white px-4 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full resize-y rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function EditPhotos({
  photoSlots,
  setPhotoSlots,
}: {
  photoSlots: EditPhotoSlot[];
  setPhotoSlots: Dispatch<SetStateAction<EditPhotoSlot[]>>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

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
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          setError(null);

          const remaining = Math.max(0, 10 - photoSlots.length);
          const nextFiles = files.slice(0, remaining);
          if (files.length > remaining) setError("Максимум 10 фото");

          try {
            const prepared: Array<{ kind: "pending"; file: File; objectUrl: string }> = [];
            for (const f of nextFiles) {
              const p = await prepareListingPhotoForPicker(f);
              prepared.push({ kind: "pending", file: p.file, objectUrl: p.objectUrl });
            }
            setPhotoSlots((prev) => [...prev, ...prepared]);
          } catch (err) {
            console.error("[edit listing] photo prepare failed", err);
            setError(listingPhotoPrepareUserMessage(err));
          }
          e.currentTarget.value = "";
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-black/15 bg-white px-5 text-sm font-semibold text-black shadow-sm hover:bg-black/[0.03]"
        >
          Выбрать фото
        </button>
        <div className="grid gap-0.5 text-sm text-black/55">
          <span>Можно добавить до 10 фото</span>
          <span className="text-xs text-black/50">{photoSlots.length} из 10 фото</span>
        </div>
      </div>

      {photoSlots.length === 0 ? <p className="text-sm text-black/45">Фото не выбраны</p> : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {photoSlots.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {photoSlots.map((slot, idx) => {
            const src = slot.kind === "saved" ? slot.url : slot.objectUrl;
            const key = slot.kind === "saved" ? `s-${slot.url}` : `p-${slot.objectUrl}`;
            return (
              <div
                key={key}
                className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-black/10 bg-black/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover transition duration-150 ease-out group-hover:brightness-[0.88]"
                />
                <button
                  type="button"
                  aria-label="Удалить это фото"
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setPhotoSlots((prev) => {
                      const removed = prev[idx];
                      if (removed?.kind === "pending") {
                        URL.revokeObjectURL(removed.objectUrl);
                      }
                      return prev.filter((_, i) => i !== idx);
                    });
                  }}
                  className="absolute right-1 top-1 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-white/95 text-[18px] leading-none text-black shadow-md ring-1 ring-black/10 transition-opacity duration-150 hover:bg-white hover:brightness-105 sm:opacity-85 sm:group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
