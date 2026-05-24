/** Visual tokens for catalog category cards (no external assets). */
export function catalogCategoryVisual(iconKey: string): {
  gradient: string;
  glyph: string;
} {
  switch (iconKey) {
    case "auto":
      return { gradient: "from-slate-600 to-slate-800", glyph: "А" };
    case "build":
      return { gradient: "from-amber-600 to-orange-700", glyph: "С" };
    case "repair":
      return { gradient: "from-blue-500 to-indigo-600", glyph: "Р" };
    case "truck":
      return { gradient: "from-emerald-600 to-teal-700", glyph: "П" };
    case "gear":
      return { gradient: "from-zinc-500 to-zinc-700", glyph: "Т" };
    case "shop":
      return { gradient: "from-rose-500 to-pink-600", glyph: "М" };
    default:
      return { gradient: "from-gray-500 to-gray-700", glyph: "•" };
  }
}
