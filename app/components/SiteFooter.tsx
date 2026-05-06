"use client";

import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-black/10">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-6 text-sm text-gray-500">
        <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-gray-500">
          <span>© {new Date().getFullYear()} Haliwali</span>
          <span className="text-gray-400">·</span>
          <Link href="/privacy" className="text-gray-500 hover:text-gray-700 hover:underline">
            Политика конфиденциальности
          </Link>
          <span className="text-gray-400">·</span>
          <Link href="/terms" className="text-gray-500 hover:text-gray-700 hover:underline">
            Пользовательское соглашение
          </Link>
          <span className="text-gray-400">·</span>
          <Link href="/about" className="text-gray-500 hover:text-gray-700 hover:underline">
            О сервисе
          </Link>
          <span className="text-gray-400">·</span>
          <Link href="/contact" className="text-gray-500 hover:text-gray-700 hover:underline">
            Обратная связь
          </Link>
        </div>
      </div>
    </footer>
  );
}

