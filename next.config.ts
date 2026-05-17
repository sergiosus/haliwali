import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    // CSP notes:
    // - Self-hosted Jitsi (meet.haliwali.ru) for audio calls: frame-src, script-src, connect-src.
    // - Next.js/Turbopack may require eval in dev; keep it off in production.
    const jitsiOrigin = "https://meet.haliwali.ru";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://*.maps.yandex.net https://*.yandex.ru https://yastatic.net",
      "style-src 'self' 'unsafe-inline' https://yastatic.net",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://api-maps.yandex.ru https://yastatic.net ${jitsiOrigin} https://mc.yandex.ru`,
      `script-src-elem 'self' 'unsafe-inline' https://api-maps.yandex.ru https://yastatic.net ${jitsiOrigin} https://mc.yandex.ru`,
      [
        "connect-src 'self'",
        jitsiOrigin,
        "wss://meet.haliwali.ru",
        "https://api-maps.yandex.ru",
        "https://*.maps.yandex.net",
        "https://*.yandex.ru",
      ].join(" "),
      `frame-src ${jitsiOrigin}`,
      "media-src 'self' blob:",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: 'camera=(), microphone=(self "https://meet.haliwali.ru"), geolocation=(self), payment=()',
          },
          // Prefer CSP for framing control; keep SAMEORIGIN to protect Haliwali from being framed by others.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
