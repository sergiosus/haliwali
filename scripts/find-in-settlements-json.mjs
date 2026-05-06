import fs from "node:fs";
import path from "node:path";

const target = (process.argv[2] ?? "Ижевск").trim();
const p = path.join(process.cwd(), "app", "data", "settlements_ru.json");
const raw = fs.readFileSync(p, "utf8");
const arr = JSON.parse(raw);
if (!Array.isArray(arr)) throw new Error("settlements_ru.json is not an array");

const out = [];
for (const r of arr) {
  if (!r || typeof r !== "object") continue;
  const name = String(r.name ?? "").trim();
  if (name.toLowerCase() !== target.toLowerCase()) continue;
  out.push({ name, region: String(r.region ?? ""), lat: r.lat, lng: r.lng });
  if (out.length >= 20) break;
}

// eslint-disable-next-line no-console
console.log({ target, matches: out.length, sample: out });

