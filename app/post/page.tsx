import Link from "next/link";

export default function PostChooserPage() {
  return (
    <div className="min-h-full bg-black/[0.03] px-4 py-10 text-black">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Разместить объявление</h1>
            <p className="mt-2 text-sm text-gray-500">Выберите тип объявления</p>
          </div>

          <div className="mt-8 grid gap-3">
            <Link
              href="/post/task"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-500 bg-white px-5 text-sm font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-600 hover:text-white"
            >
              Разместить задачу
            </Link>
            <Link
              href="/post/service"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-500 bg-white px-5 text-sm font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-600 hover:text-white"
            >
              Предложить услугу
            </Link>
            <Link
              href="/post/product"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-500 bg-white px-5 text-sm font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-600 hover:text-white"
            >
              Разместить товар
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
