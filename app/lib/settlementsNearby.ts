import {
  isValidSettlementName,
  shouldSuppressNearIzhevskReference,
} from "./settlementNameValidation";
import { buildSearchVariants } from "./utils/keyboardLayout";

const BOGUS_SETTLEMENT_NAMES = new Set(["ижау"]);
function isBogusSettlementName(name: string): boolean {
  return BOGUS_SETTLEMENT_NAMES.has((name ?? "").trim().toLowerCase());
}

export type LatLng = { readonly lat: number; readonly lng: number };

export type SettlementRecord = {
  readonly name: string;
  /** Russian region name; empty when unmapped (never expose raw admin codes in UI). */
  readonly region: string;
  readonly lat: number;
  readonly lng: number;
};

function keepSettlementRow(s: SettlementRecord): boolean {
  return (
    isValidSettlementName(s.name) &&
    !isBogusSettlementName(s.name) &&
    !shouldSuppressNearIzhevskReference(s.name, s.lat, s.lng)
  );
}

/** Clean dataset: name rules + Ижевск halo (drops legacy «Иж» garbage in JSON). */
export const ALL_SETTLEMENTS = Object.freeze(
  [] as readonly SettlementRecord[],
) as readonly SettlementRecord[];

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

export function findNearestSettlement(center: LatLng): SettlementRecord | null {
  let best: SettlementRecord | null = null;
  let bestD = Infinity;
  for (const s of ALL_SETTLEMENTS) {
    if (isBogusSettlementName(s.name)) continue;
    if (
      !isValidSettlementName(s.name) ||
      shouldSuppressNearIzhevskReference(s.name, s.lat, s.lng)
    ) {
      continue;
    }
    const d = distanceKm(center, s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export type NearbySettlementWithDistance = SettlementRecord & { readonly distanceKm: number };

export function findNearbySettlements(
  center: LatLng,
  radiusKm = 100,
  limit = 50,
): NearbySettlementWithDistance[] {
  const out: NearbySettlementWithDistance[] = [];
  for (const s of ALL_SETTLEMENTS) {
    if (isBogusSettlementName(s.name)) continue;
    const d = distanceKm(center, s);
    if (d <= radiusKm + 1e-9) {
      out.push({ name: s.name, region: s.region, lat: s.lat, lng: s.lng, distanceKm: d });
    }
  }
  out.sort(
    (a, b) =>
      a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, "ru"),
  );
  return out.slice(0, limit);
}

/**
 * Russia-wide name search over {@link ALL_SETTLEMENTS} (no circle / type filter).
 * For modal suggestions only; keep query length ≥ 2 at call site.
 */
function bestSettlementMatchRank(name: string, reg: string, variants: readonly string[]): number {
  let rank = 100;
  for (const q of variants) {
    if (!q || q.length < 2) continue;
    if (name === q) rank = Math.min(rank, 0);
    else if (name.startsWith(q)) rank = Math.min(rank, 1);
    else if (name.includes(q)) rank = Math.min(rank, 2);
    else if (reg.includes(q)) rank = Math.min(rank, 4);
  }
  return rank;
}

export function searchSettlementsByQuery(query: string, limit = 64): SettlementRecord[] {
  const raw = query.trim();
  if (raw.length < 2) return [];
  const variants = buildSearchVariants(raw);
  if (variants.length === 0) return [];
  const scored: { s: SettlementRecord; rank: number }[] = [];
  for (const s of ALL_SETTLEMENTS) {
    if (isBogusSettlementName(s.name)) continue;
    const name = (s.name ?? "").toLowerCase();
    const reg = (s.region ?? "").toLowerCase();
    const rank = bestSettlementMatchRank(name, reg, variants);
    if (rank >= 100) continue;
    scored.push({ s, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name, "ru"));
  const seen = new Set<string>();
  const out: SettlementRecord[] = [];
  for (const x of scored) {
    const k = `${x.s.name}\0${x.s.region}\0${x.s.lat}\0${x.s.lng}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x.s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Max distance to merge two placemarks as duplicate display (300–500 m band). */
const DISPLAY_DEDUPE_MAX_KM = 0.45;
/** If a truncated / abbreviated junk name overlaps a full name within this radius, hide the junk in display. */
const DISPLAY_ABBREV_SUPPRESS_MAX_KM = 20;
const SHORT_CYRILLIC_ONLY = /^[А-Яа-яЁё]{1,2}$/u;

function namesAreDisplayDuplicates(nameA: string, nameB: string, distanceBetweenKm: number): boolean {
  const na = nameA.trim();
  const nb = nameB.trim();
  if (na.toLowerCase() === nb.toLowerCase()) return distanceBetweenKm <= DISPLAY_DEDUPE_MAX_KM + 1e-12;
  if (na.length === 0 || nb.length === 0) return false;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  const shortOk = isValidSettlementName(short);
  const longOk = isValidSettlementName(long);
  const shortIsAbbrevJunk = !shortOk || SHORT_CYRILLIC_ONLY.test(short);
  if (
    shortIsAbbrevJunk &&
    longOk &&
    long.toLowerCase().startsWith(short.toLowerCase()) &&
    distanceBetweenKm <= DISPLAY_ABBREV_SUPPRESS_MAX_KM + 1e-12
  ) {
    return true;
  }
  return false;
}

export type SettlementDisplayRow = {
  name: string;
  lat: number;
  lng: number;
  region: string;
  distanceKm: number;
};

function dRank(name: string): number {
  const t = name.trim();
  if (!t) return 99;
  if (/\bгород\b/i.test(t)) return 0;
  if (/^(деревня|село|хутор|аул|станица)\b/i.test(t)) return 3;
  if (
    /пгт|посёлок городского типа|рабочий посёлок|городской посёлок/i.test(t) ||
    /^посёлок\b/i.test(t)
  ) {
    return 1;
  }
  if (/^(д\.|с\.|п\.|р\.п\.|н\.п\.|кп\.)\s/i.test(t)) return 3;
  if (/деревня|село|хутор|посёлок|пгт/i.test(t)) return 2;
  return 0;
}

function dCmp(a: SettlementDisplayRow, b: SettlementDisplayRow): number {
  const ra = dRank(a.name);
  const rb = dRank(b.name);
  if (ra !== rb) return ra - rb;
  const la = a.name.trim().length;
  const lb = b.name.trim().length;
  if (la !== lb) return la - lb;
  return a.name.localeCompare(b.name, "ru");
}

class UnionFindDisplay {
  private readonly p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    if (this.p[i] !== i) this.p[i] = this.find(this.p[i]!);
    return this.p[i]!;
  }
  union(i: number, j: number): void {
    const a = this.find(i);
    const b = this.find(j);
    if (a !== b) this.p[a] = b;
  }
}

function dMerge(a: SettlementDisplayRow, b: SettlementDisplayRow): boolean {
  const d = distanceKm(a, b);
  if (d > DISPLAY_ABBREV_SUPPRESS_MAX_KM + 1e-12) return false;
  return namesAreDisplayDuplicates(a.name, b.name, d);
}

export function dedupeSettlementsForDisplay<T extends SettlementDisplayRow>(rows: T[]): T[] {
  const n = rows.length;
  if (n === 0) return [];

  const uf = new UnionFindDisplay(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dMerge(rows[i]!, rows[j]!)) uf.union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const list = byRoot.get(r) ?? [];
    list.push(i);
    byRoot.set(r, list);
  }

  const out: T[] = [];
  for (const idxs of byRoot.values()) {
    const group = idxs.map((k) => rows[k]!);
    let best = group[0]!;
    for (let k = 1; k < group.length; k++) {
      const x = group[k]!;
      if (dCmp(x, best) < 0) best = x;
    }
    const minD = Math.min(...group.map((g) => g.distanceKm));
    out.push({ ...best, distanceKm: minD });
  }

  out.sort(
    (a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, "ru"),
  );
  return out;
}
