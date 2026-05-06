/**
 * Reads GeoNames RU.txt (tab-separated), filters settlements, writes settlements_preview.csv
 */
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "app/data/raw/RU.txt");
const OUTPUT = path.join(ROOT, "app/data/settlements_preview.csv");

const FEATURE_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLC"]);

/** Basic Cyrillic letters (incl. Ё/ё); GeoNames may use other Cyrillic-range chars */
function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(s);
}

function firstCyrillicFromAlternates(alternatenames) {
  if (!alternatenames || !alternatenames.trim()) return null;
  for (const raw of alternatenames.split(",")) {
    const part = raw.trim();
    if (part && hasCyrillic(part)) return part;
  }
  return null;
}

function pickNameRu(name, alternatenames) {
  const fromAlt = firstCyrillicFromAlternates(alternatenames);
  if (fromAlt !== null) return fromAlt;
  return (name ?? "").trim();
}

function validCoords(latStr, lngStr) {
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function csvEscape(s) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const seen = new Set();
  const rows = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 11) continue;

    const featureClass = cols[6];
    const featureCode = cols[7];
    if (featureClass !== "P" || !FEATURE_CODES.has(featureCode)) continue;

    const name = cols[1];
    const alternatenames = cols[3];
    const latStr = cols[4];
    const lngStr = cols[5];
    const regionCode = (cols[10] ?? "").trim();

    const coords = validCoords(latStr, lngStr);
    if (!coords) continue;

    const nameRu = pickNameRu(name, alternatenames);
    if (!nameRu) continue;

    const dedupeKey = `${nameRu}\t${coords.lat}\t${coords.lng}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      name_ru: nameRu,
      lat: coords.lat,
      lng: coords.lng,
      region_code: regionCode,
      feature_code: featureCode,
    });
  }

  rows.sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru"));

  const header = "name_ru,lat,lng,region_code,feature_code";
  const lines = [
    header,
    ...rows.map(
      (r) =>
        [
          csvEscape(r.name_ru),
          r.lat,
          r.lng,
          csvEscape(r.region_code),
          csvEscape(r.feature_code),
        ].join(","),
    ),
  ];

  fs.writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${rows.length} rows to ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
