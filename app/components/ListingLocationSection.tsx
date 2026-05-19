"use client";

import { useCallback, useMemo, useState } from "react";
import { isFederalRussiaSettlementName } from "../lib/locationDisplay";
import { listingLocationModalValue } from "../lib/listingLocationModal";
import type { SelectedLocation } from "../lib/selectedLocation";
import { persistBrowseLocationScope } from "../lib/browseLocationScope";
import { LocationModal, type LocationModalChangePayload } from "./modals/LocationModal";

/** «Выбрано: Москва» / «Выбрано: Город, регион». */
export function listingLocationChosenCaption(sl: SelectedLocation | null): string {
  if (!sl?.city?.trim()) return "";
  const city = sl.city.trim();
  const region = (sl.region ?? "").trim();
  if (isFederalRussiaSettlementName(city)) return city;
  if (region) return `${city}, ${region}`;
  const dn = sl.displayName?.trim();
  return dn || city;
}

type Props = {
  selectedLocation: SelectedLocation | null;
  onSelectedLocationChange: (next: SelectedLocation | null) => void;
  /** @deprecated Draft text is not used for listing location display or modal seeding. */
  draftText?: string;
  onDraftTextChange?: (v: string) => void;
  /** Список городов каталога (как у главной). */
  cities: readonly string[];
  disabled?: boolean;
  onLocationMessage?: (msg: string | null) => void;
  /** @deprecated Use onSelectedLocationChange(null) via modal «Вся Россия». */
  onWholeRussiaPicked?: () => void;
  /** When true, also updates global browse filters (homepage/map). Default false for listing forms. */
  syncGlobalBrowseScope?: boolean;
};

export function ListingLocationSection({
  selectedLocation,
  onSelectedLocationChange,
  draftText: _draftText,
  onDraftTextChange,
  cities,
  disabled,
  onLocationMessage,
  onWholeRussiaPicked,
  syncGlobalBrowseScope = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const modalValue = useMemo(() => listingLocationModalValue(selectedLocation), [selectedLocation]);

  /** User-confirmed selection only — runs when «Выбрать эту область» fires in LocationModal. */
  const applyConfirmedModalResult = useCallback(
    (next: LocationModalChangePayload) => {
      const c = `${next.city}`.trim();
      const reg = `${next.region}`.trim();

      if (next.scope?.type === "country" || next.pickKind === "whole" || (!c && reg === "Вся Россия")) {
        onWholeRussiaPicked?.();
        onDraftTextChange?.("");
        onLocationMessage?.(null);
        onSelectedLocationChange(null);
        setPickerOpen(false);
        return;
      }

      const lat = typeof next.lat === "number" && Number.isFinite(next.lat) ? next.lat : undefined;
      const lng = typeof next.lng === "number" && Number.isFinite(next.lng) ? next.lng : undefined;

      const sl: SelectedLocation = {
        city: c,
        region: `${next.region ?? ""}`.trim(),
        displayName: (next.displayName ?? "").trim() || c,
        address: (next.displayName ?? "").trim() || c,
        latitude: lat,
        longitude: lng,
        source: "suggestion",
      };

      onLocationMessage?.(null);
      onSelectedLocationChange(sl);
      onDraftTextChange?.(sl.displayName || (sl.region && sl.city ? `${sl.city}, ${sl.region}` : sl.city));

      if (syncGlobalBrowseScope) {
        persistBrowseLocationScope({
          type: "city",
          label: sl.city,
          region: sl.region,
          parentName: sl.region,
          lat,
          lng,
        });
      }

      setPickerOpen(false);
    },
    [onDraftTextChange, onLocationMessage, onSelectedLocationChange, onWholeRussiaPicked, syncGlobalBrowseScope],
  );

  function openPickerFull() {
    if (disabled) return;
    onLocationMessage?.(null);
    setPickerOpen(true);
  }

  function closePickerWithoutCommit() {
    setPickerOpen(false);
  }

  const fieldLabel = listingLocationChosenCaption(selectedLocation)?.trim() || "Вся Россия";

  const triggerCls = [
    "min-h-[48px] min-w-0 max-w-full flex-1 overflow-hidden rounded-2xl border border-black/[0.08] bg-white px-4 py-3 text-left text-sm text-black/85 outline-none transition-colors hover:border-black/[0.14] hover:bg-black/[0.015] disabled:opacity-45",
    disabled ? "cursor-not-allowed" : "cursor-pointer",
  ].join(" ");

  return (
    <>
      <div className="grid w-full gap-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
        <div className="text-base font-semibold text-black">Местоположение</div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
          <button type="button" disabled={disabled} onClick={openPickerFull} className={triggerCls}>
            <span className="block min-w-0 overflow-hidden font-medium text-ellipsis whitespace-nowrap">{fieldLabel}</span>
          </button>
        </div>

        <p className="text-xs leading-relaxed text-black/52">
          По умолчанию «Вся Россия». Город подставляется только после подтверждения в окне выбора.
        </p>

        {selectedLocation ?
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelectedLocationChange(null);
              onDraftTextChange?.("");
              onLocationMessage?.(null);
            }}
            className="w-fit text-left text-sm font-medium text-black/58 underline underline-offset-2 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Сбросить местоположение
          </button>
        : null}
      </div>

      {pickerOpen ?
        <LocationModal
          variant="listing"
          listingSubMode="full"
          listingFormMode
          open
          cities={cities}
          value={modalValue}
          onClose={closePickerWithoutCommit}
          onChange={applyConfirmedModalResult}
        />
      : null}
    </>
  );
}
