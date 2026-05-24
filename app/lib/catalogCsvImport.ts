import type { CatalogCompanyImportRow } from "./catalogTypes";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type CatalogCsvRow = {
  name: string;
  category: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
};

const HEADER_ALIASES: Record<string, keyof CatalogCsvRow> = {
  name: "name",
  название: "name",
  category: "category",
  категория: "category",
  city: "city",
  город: "city",
  address: "address",
  адрес: "address",
  phone: "phone",
  телефон: "phone",
  email: "email",
  website: "website",
  сайт: "website",
  description: "description",
  описание: "description",
  latitude: "latitude",
  lat: "latitude",
  широта: "latitude",
  longitude: "longitude",
  lng: "longitude",
  lon: "longitude",
  долгота: "longitude",
  image_url: "imageUrl",
  image: "imageUrl",
  logo: "imageUrl",
  source_url: "sourceUrl",
};

/** @deprecated Use parseCatalogImportCsv for draft import */
export function parseCatalogCompaniesCsv(text: string): CatalogCompanyImportRow[] {
  return parseCatalogImportCsv(text).map((r) => ({
    name: r.name,
    category: r.category,
    city: r.city,
    address: r.address,
    phone: r.phone,
    website: r.website,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export function parseCatalogImportCsv(text: string): CatalogCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerCells = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const colMap: (keyof CatalogCsvRow | null)[] = headerCells.map((h) => {
    const key = HEADER_ALIASES[h.replace(/\s+/g, "")] ?? HEADER_ALIASES[h];
    return key ?? null;
  });

  const rows: CatalogCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]!);
    const row: CatalogCsvRow = {
      name: "",
      category: "",
      city: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      description: "",
      latitude: null,
      longitude: null,
      imageUrl: null,
      sourceUrl: null,
    };
    colMap.forEach((key, idx) => {
      if (!key) return;
      const val = cells[idx] ?? "";
      if (key === "latitude" || key === "longitude") {
        row[key] = numOrNull(val);
      } else {
        row[key] = val;
      }
    });
    if (row.name.trim()) rows.push(row);
  }
  return rows;
}
