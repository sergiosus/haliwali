/**
 * Converts GeoNames RU.txt → app/data/russia-settlements.json
 * Filter: feature class P, codes PPL | PPLA | PPLA2 | PPLX
 *
 * Usage: node scripts/convert-ru-geonames-to-json.mjs
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "app", "data", "raw", "RU.txt");
const OUTPUT = path.join(ROOT, "app", "data", "russia-settlements.json");

const ALLOWED_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLX"]);

/** Prefer a Cyrillic label from alternatenames when GeoNames `name` is Latin. */
const CYRILLIC = /[А-Яа-яЁё]/;
/** Skip Ukrainian/Belarusian-style spellings when a Russian Cyrillic alt exists (e.g. Іжевськ vs Ижевск). */
const PREFER_SKIP_ALT = /[\u0406\u0456]/;
/** GeoNames occasionally lists typo alternates (e.g. «Санкт Петерзбург»); prefer real «Петерб» forms. */
const BOGUS_ALT = /етерзб/i;

function pickSettlementName(primary, alternatenamesRaw) {
  const primaryTrim = (primary ?? "").trim();
  if (CYRILLIC.test(primaryTrim) && !PREFER_SKIP_ALT.test(primaryTrim)) return primaryTrim;
  const alts = (alternatenamesRaw ?? "").split(",");
  const candidates = [];
  let fallbackCyrillic = "";
  for (const raw of alts) {
    const a = raw.trim();
    if (!a || !CYRILLIC.test(a)) continue;
    if (PREFER_SKIP_ALT.test(a)) {
      if (!fallbackCyrillic) fallbackCyrillic = a;
      continue;
    }
    if (BOGUS_ALT.test(a)) continue;
    candidates.push(a);
  }
  if (candidates.length) {
    candidates.sort((a, b) => {
      const ah = a.includes("-") ? 1 : 0;
      const bh = b.includes("-") ? 1 : 0;
      if (bh !== ah) return bh - ah;
      return b.length - a.length;
    });
    return candidates[0] ?? primaryTrim;
  }
  if (fallbackCyrillic) return fallbackCyrillic;
  return primaryTrim;
}

/** Dedupe: same rounded coordinates → keep row with highest population. */
function coordKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("Missing input:", INPUT);
    process.exit(1);
  }

  const byCoord = new Map();
  let lines = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines++;
    if (!line.trim()) continue;
    const p = line.split("\t");
    if (p.length < 15) continue;

    const primaryName = (p[1] ?? "").trim();
    if (!primaryName) continue;
    const name = pickSettlementName(primaryName, p[3] ?? "");
    if (!name) continue;

    const lat = Number.parseFloat(p[4]);
    const lng = Number.parseFloat(p[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    if (p[6] !== "P") continue;
    if (!ALLOWED_CODES.has(p[7] ?? "")) continue;

    const population = Number.parseInt(p[14] ?? "0", 10);
    const pop = Number.isFinite(population) && population > 0 ? population : 0;

    const key = coordKey(lat, lng);
    const prev = byCoord.get(key);
    if (!prev || pop > prev.population) {
      byCoord.set(key, {
        name,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        population: pop,
      });
    }
  }

  const out = [...byCoord.values()];
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out), "utf8");

  console.log("Lines read:", lines);
  console.log("Rows after filter (before coord-dedupe would be higher); unique coords:", out.length);
  console.log("Written:", OUTPUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
