/**
 * Loads Yandex Maps JS API 2.1 once. No geocoder usage here.
 */

export function getYandexMapsApiKey(): string {
  return (process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "").trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type YmapsNamespace = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Bumped so older minimal-bundle `<script>` tags are not reused (they lack `ymaps.Circle`). */
const SCRIPT_SELECTOR = 'script[data-haliwali-yandex-maps-api="2.1"][data-haliwali-yandex-bundle="full"]';

let loadInflight: Promise<YmapsNamespace> | null = null;

function ymapsReady(ymaps: YmapsNamespace): Promise<YmapsNamespace> {
  return new Promise((resolve, reject) => {
    try {
      if (!ymaps?.ready) {
        reject(new Error("NO_YMAPS_READY"));
        return;
      }
      ymaps.ready(() => resolve(ymaps));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Loads `https://api-maps.yandex.ru/2.1/` exactly once per page, then resolves after `ymaps.ready()`.
 * Rejects when key is missing or `window` is unavailable.
 */
export function loadYandexMaps(): Promise<YmapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("NO_WINDOW"));
  }

  const w = window as Window & { ymaps?: YmapsNamespace };
  if (w.ymaps) return ymapsReady(w.ymaps);

  const key = getYandexMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("NO_YANDEX_MAPS_API_KEY"));
  }

  if (loadInflight) return loadInflight;

  loadInflight = new Promise((YmapsResolve, reject) => {
    const finish = () => {
      const ym = (window as Window & { ymaps?: YmapsNamespace }).ymaps;
      if (!ym) {
        loadInflight = null;
        reject(new Error("NO_YMAPS_AFTER_LOAD"));
        return;
      }
      void ymapsReady(ym).then(YmapsResolve, (e) => {
        loadInflight = null;
        reject(e);
      });
    };

    const existing = document.querySelector(SCRIPT_SELECTOR) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => {
          loadInflight = null;
          reject(new Error("YANDEX_SCRIPT_ERROR"));
        },
        { once: true },
      );
      /* script may already be loaded */
      if (w.ymaps) queueMicrotask(finish);
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-haliwali-yandex-maps-api", "2.1");
    script.setAttribute("data-haliwali-yandex-bundle", "full");
    script.async = true;
    /* `package.full` includes `ymaps.Circle` (not present in the default minimal bundle). */
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU&load=package.full`;
    script.onload = () => finish();
    script.onerror = () => {
      loadInflight = null;
      reject(new Error("YANDEX_SCRIPT_ERROR"));
    };
    document.head.appendChild(script);
  });

  return loadInflight;
}
