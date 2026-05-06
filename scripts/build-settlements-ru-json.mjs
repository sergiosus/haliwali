/**
 * Converts app/data/settlements_preview_clean.csv → app/data/settlements_ru.json
 * Columns: name, region, lat, lng (region from GeoNames admin1 code → Russian label).
 *
 * Usage: node scripts/build-settlements-ru-json.mjs
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { regionLabelFromGeoNamesAdmin1Code } from "./ruGeoNamesAdmin1RuLabels.mjs";
import { isValidSettlementName } from "./settlementNameValidation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "app", "data", "settlements_preview_clean.csv");
const OUTPUT = path.join(ROOT, "app", "data", "settlements_ru.json");

/** CSV columns: name_ru, lat, lng, region_code, district_code, feature_code, population — join extra commas into name. */
function splitSettlementCsvLine(line) {
  const parts = line.split(",");
  if (parts.length < 7) return null;
  const population = parts.pop();
  const feature_code = parts.pop();
  const district_code = parts.pop();
  const region_code = parts.pop();
  const lng = parts.pop();
  const lat = parts.pop();
  const name_ru = parts.join(",");
  return { name_ru, lat, lng, region_code, district_code, feature_code, population };
}

async function main() {
  const out = [];
  let lineNo = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNo++;
    if (lineNo === 1) continue;
    if (!line.trim()) continue;
    const p = splitSettlementCsvLine(line);
    if (!p) continue;
    const name_ru = p.name_ru.trim();
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const region_code = (p.region_code ?? "").trim();
    if (!name_ru || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isValidSettlementName(name_ru)) continue;

    const region = regionLabelFromGeoNamesAdmin1Code(region_code);
    out.push({
      name: name_ru,
      region,
      lat,
      lng,
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out), "utf8");
  console.log(`Wrote ${out.length} settlements → ${OUTPUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
