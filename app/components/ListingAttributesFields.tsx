"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import type { ListingType } from "../lib/listingModel";
import {
  getListingAttributeFieldDefs,
  normalizeListingCategoryKey,
  type ListingAttributeFieldDef,
  type ListingAttributes,
} from "../lib/listingAttributes";

const controlClass =
  "box-border h-11 w-full rounded-lg border border-black/15 bg-white px-4 text-sm leading-normal outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]";

const selectClass = `${controlClass} appearance-none`;

const checkboxWrapClass =
  "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-black/15 bg-white px-4 text-sm leading-normal text-black/80";

function AttrField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="block text-sm font-medium leading-normal text-black/80">{label}</span>
      {children}
    </label>
  );
}

export function ListingAttributesFields({
  categoryName,
  categorySlug,
  listingType,
  value,
  onChange,
  disabled,
}: {
  categoryName: string;
  categorySlug: string;
  listingType: ListingType;
  value: ListingAttributes;
  onChange: (next: ListingAttributes) => void;
  disabled?: boolean;
}) {
  const fieldListId = useId();

  const fields = useMemo(
    () => getListingAttributeFieldDefs(categoryName, categorySlug, listingType),
    [categoryName, categorySlug, listingType],
  );

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, ListingAttributeFieldDef[]>();
    for (const def of fields) {
      const g = def.group?.trim() || "";
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(def);
    }
    return order.map((g) => ({ label: g, fields: byGroup.get(g)! }));
  }, [fields]);

  const categoryKey = `${listingType}:${(categorySlug ?? "").trim()}:${normalizeListingCategoryKey(categoryName)}`;
  const prevCategoryKeyRef = useRef(categoryKey);
  useEffect(() => {
    if (prevCategoryKeyRef.current === categoryKey) return;
    prevCategoryKeyRef.current = categoryKey;
    onChange({});
  }, [categoryKey, onChange]);

  if (!fields.length) return null;

  function setKey(key: string, nextVal: string | number | boolean | undefined) {
    const next = { ...value };
    if (nextVal === undefined || nextVal === "" || (typeof nextVal === "number" && !Number.isFinite(nextVal))) {
      delete next[key];
    } else {
      next[key] = nextVal;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4">
      <div className="text-sm font-medium text-black/80">Дополнительные характеристики</div>
      <p className="text-xs text-black/50">Необязательно — помогут покупателям найти объявление.</p>
      <div className="flex flex-col gap-4">
        {groups.map(({ label: groupLabel, fields: groupFields }) => (
          <div key={groupLabel || "default"} className="flex flex-col gap-3">
            {groupLabel ?
              <div className="text-xs font-semibold uppercase tracking-wide text-black/45">{groupLabel}</div>
            : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {groupFields.map((def) => {
                const raw = value[def.key];
                if (def.type === "boolean") {
                  const checked = raw === true;
                  return (
                    <label key={def.key} className={checkboxWrapClass}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        className="h-4 w-4 shrink-0 rounded border-black/20"
                        onChange={(e) => setKey(def.key, e.target.checked ? true : undefined)}
                      />
                      <span>{def.label}</span>
                    </label>
                  );
                }

                if (def.type === "select" && def.options?.length) {
                  if (def.searchable) {
                    const listId = `${fieldListId}-${def.key}`;
                    return (
                      <AttrField key={def.key} label={def.label}>
                        <input
                          list={listId}
                          value={typeof raw === "string" ? raw : ""}
                          disabled={disabled}
                          placeholder="Начните вводить или выберите"
                          className={controlClass}
                          onChange={(e) => setKey(def.key, e.target.value || undefined)}
                        />
                        <datalist id={listId}>
                          {def.options.map((opt) => (
                            <option key={opt} value={opt} />
                          ))}
                        </datalist>
                      </AttrField>
                    );
                  }

                  return (
                    <AttrField key={def.key} label={def.label}>
                      <select
                        value={typeof raw === "string" ? raw : ""}
                        disabled={disabled}
                        className={selectClass}
                        onChange={(e) => setKey(def.key, e.target.value || undefined)}
                      >
                        <option value="">—</option>
                        {def.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </AttrField>
                  );
                }

                const inputValue =
                  def.type === "number" ?
                    raw === undefined || raw === null ?
                      ""
                    : String(raw)
                  : typeof raw === "string" ? raw
                  : "";
                const label = def.unit ? `${def.label}, ${def.unit}` : def.label;

                return (
                  <AttrField key={def.key} label={label}>
                    <input
                      value={inputValue}
                      disabled={disabled}
                      placeholder={def.placeholder}
                      inputMode={def.type === "number" ? "numeric" : undefined}
                      className={controlClass}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v.trim()) {
                          setKey(def.key, undefined);
                          return;
                        }
                        if (def.type === "number") {
                          const n = Number(v);
                          setKey(def.key, Number.isFinite(n) ? n : undefined);
                        } else {
                          setKey(def.key, v);
                        }
                      }}
                    />
                  </AttrField>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
