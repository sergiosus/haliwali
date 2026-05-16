import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthBootstrap } from "./components/AuthBootstrap";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { YandexMetrika } from "./components/YandexMetrika";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { siteUrl } from "./lib/siteUrl";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#FF7F50",
};

export const metadata: Metadata = {
  title: "Haliwali — задачи, услуги и товары в России",
  description:
    "Размещайте задачи, предлагайте услуги, покупайте и продавайте товары по всей России без посредников.",
  keywords: [
    "задачи",
    "услуги",
    "товары",
    "объявления",
    "купить",
    "продать",
    "найти исполнителя",
    "работа",
    "помощь",
    "Россия",
  ],
  metadataBase: new URL(siteUrl()),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Haliwali — задачи, услуги и товары в России",
    description:
      "Размещайте задачи, предлагайте услуги, покупайте и продавайте товары по всей России без посредников.",
    type: "website",
    url: "/",
    siteName: "Haliwali",
  },
  twitter: {
    card: "summary_large_image",
    title: "Haliwali — задачи, услуги и товары в России",
    description:
      "Размещайте задачи, предлагайте услуги, покупайте и продавайте товары по всей России без посредников.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Haliwali",
    statusBarStyle: "default",
  },
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
        <AuthBootstrap />
        <Suspense
          fallback={
            <div className="sticky top-0 z-50 h-[57px] border-b border-gray-200 bg-white" aria-hidden />
          }
        >
          <SiteHeader />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
        <SiteFooter />
        <CookieConsentBanner />
        <PwaInstallPrompt />
        <YandexMetrika />
      </body>
    </html>
  );
}
