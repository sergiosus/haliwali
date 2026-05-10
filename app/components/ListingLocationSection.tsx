"use client";

import { useCallback, useState } from "react";
import { isFederalRussiaSettlementName } from "../lib/locationDisplay";
import type { SelectedLocation } from "../lib/selectedLocation";
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
  draftText: string;
  onDraftTextChange: (v: string) => void;
  selectedLocation: SelectedLocation | null;
  onSelectedLocationChange: (next: SelectedLocation | null) => void;
  /** True when объявление по всей России (нет города из комбобокса и точки карты). */
  wholeRussia: boolean;
  /** Список городов каталога (как у главной). */
  cities: readonly string[];
  disabled?: boolean;
  onLocationMessage?: (msg: string | null) => void;
  /** Очистить поле региона/города родителя (комбобокс) при явном выборе «Вся Россия» в модалке. */
  onWholeRussiaPicked?: () => void;
};

export function ListingLocationSection({
  draftText,
  onDraftTextChange,
  selectedLocation,
  onSelectedLocationChange,
  wholeRussia,
  cities,
  disabled,
  onLocationMessage,
  onWholeRussiaPicked,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const applyBrowseResult = useCallback(
    (next: LocationModalChangePayload) => {
      const c = `${next.city}`.trim();
      const reg = `${next.region}`.trim();

      if (next.scope?.type === "country" || next.pickKind === "whole" || (!c && reg === "Вся Россия")) {
        onWholeRussiaPicked?.();
        onLocationMessage?.(null);
        onDraftTextChange("");
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
        address: `${next.displayName ?? ""}`.trim() || c,
        latitude: lat,
        longitude: lng,
        source: "suggestion",
      };

      onLocationMessage?.(null);
      onSelectedLocationChange(sl);
      if (sl.displayName) {
        onDraftTextChange(sl.displayName);
      } else if (sl.region && sl.city) {
        onDraftTextChange(`${sl.city}, ${sl.region}`);
      } else {
        onDraftTextChange(sl.city);
      }
      setPickerOpen(false);
    },
    [onDraftTextChange, onLocationMessage, onSelectedLocationChange, onWholeRussiaPicked],
  );

  function openPickerFull() {
    if (disabled) return;
    onLocationMessage?.(null);
    setPickerOpen(true);
  }

  const fieldLabel =
    listingLocationChosenCaption(selectedLocation)?.trim() ||
    (wholeRussia ? "Вся Россия" : "") ||
    draftText.trim() ||
    "Выберите город";

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
          Можно оставить «Вся Россия» или выбрать город / район.
        </p>

        {selectedLocation ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelectedLocationChange(null);
              onDraftTextChange("");
              onLocationMessage?.(null);
            }}
            className="w-fit text-left text-sm font-medium text-black/58 underline underline-offset-2 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Сбросить местоположение
          </button>
        ) : null}
      </div>

      {pickerOpen ?
        <LocationModal
          variant="listing"
          listingSubMode="full"
          open
          cities={cities}
          value={{
            city: `${selectedLocation?.city ?? ""}`.trim(),
            region: selectedLocation?.region,
            radiusKm: 0,
            lat: selectedLocation?.latitude,
            lng: selectedLocation?.longitude,
            citySeed: draftText,
          }}
          onClose={() => setPickerOpen(false)}
          onChange={applyBrowseResult}
        />
      : null}
    </>
  );
}
