"use client";

import Link from "next/link";

export function ConsentCheckbox({
  checked,
  onChange,
  error,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-start gap-2 text-sm text-black/70">
        <input
          type="checkbox"
          required
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-black"
          disabled={disabled}
        />
        <span>
          Я даю согласие на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" className="font-semibold text-orange-600 underline hover:text-orange-700">
            политикой конфиденциальности
          </Link>
        </span>
      </label>
      {error ? <div className="mt-1 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}

