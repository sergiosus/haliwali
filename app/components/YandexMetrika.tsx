"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const METRIKA_ID = 109249357;
const TAG_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;

function isLocalDevHost(): boolean {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

export function YandexMetrika() {
  const pathname = usePathname();
  const [clientAllowed, setClientAllowed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (isLocalDevHost()) return;
    setClientAllowed(true);
  }, []);

  if (process.env.NODE_ENV !== "production") return null;
  if (pathname?.startsWith("/admin")) return null;
  if (!clientAllowed) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
(function(m,e,t,r,i,k,a){
m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document,'script','${TAG_SRC}', 'ym');

ym(${METRIKA_ID}, 'init', {
ssr:true,
webvisor:true,
clickmap:true,
ecommerce:"dataLayer",
referrer: document.referrer,
url: location.href,
accurateTrackBounce:true,
trackLinks:true
});
        `}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
