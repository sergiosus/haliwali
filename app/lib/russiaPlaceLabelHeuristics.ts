/**
 * Pure helpers for validating Russian locality/region strings (no geocoder APIs).
 */

/** True for federal districts / macro regions — never use as the city name. */
export function isMacroRegionLabel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("федеральный округ") || n.includes("федеральная территория");
}

export function isRussiaCountry(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "россия" || n === "российская федерация" || n === "russia";
}

function looksLikeRussianStreetLine(name: string): boolean {
  const x = name.trim().toLowerCase();
  return (
    /^ул\.?\s|^улица\b|^пр\.?\s|^проспект\b|^пер\.?\s|^переулок\b|^ш\.?\s|^шоссе\b|^набережная\b|^бульвар\b|^площадь\b|^тракт\b|^аллея\b|^квартал\b|^микрорайон\b/u.test(
      x,
    ) ||
    /^д\.?\s*\d+/u.test(x) ||
    /^дом\s*\d+/u.test(x) ||
    /^к\.?\s*\d+/u.test(x)
  );
}

function looksLikeMicroBlockDistrict(name: string): boolean {
  return /\d/.test(name);
}

export function looksLikeDistrictAdministrativeLabel(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes(" район") ||
    /^район\b/u.test(n) ||
    n.includes(" городской округ") ||
    n.includes(" муниципальный округ") ||
    n.includes(" административный округ") ||
    n.includes(" сельсовет") ||
    n.includes(" с/с") ||
    n.includes(" сельское поселение") ||
    n.includes(" городское поселение")
  );
}

/** Oblast / krai / republic line — not a city name. */
export function looksLikeRegionAdministrativeLabel(seg: string): boolean {
  const t = seg.trim();
  if (!t) return false;
  if (isMacroRegionLabel(t)) return true;
  const low = t.toLowerCase();
  if (low.includes(" область")) return true;
  if (low.endsWith(" край") || /\sкрай$/i.test(low)) return true;
  if (/республика\b|автономн(ый|ая|ое)\s+округ|федеральн(ая|ое)\s+территория/i.test(t)) return true;
  return false;
}

function containsForbiddenCityWords(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes("республика") ||
    n.includes("область") ||
    n.includes("край") ||
    n.includes("район") ||
    n.includes("округ") ||
    n.includes("сельсовет") ||
    n.includes("с/с") ||
    n.includes("поселение") ||
    n.includes("горы") ||
    n.includes("гора") ||
    n.includes("море") ||
    n.includes("река") ||
    n.includes("озеро") ||
    n.includes("водохранилище") ||
    n.includes("лес") ||
    n.includes("парк") ||
    n.includes("урочище") ||
    n.includes("гидро") ||
    n.includes("hydro")
  );
}

function isCleanSettlementCandidate(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (isMacroRegionLabel(t)) return false;
  if (looksLikeMicroBlockDistrict(t)) return false;
  if (looksLikeRussianStreetLine(t)) return false;
  if (looksLikeRegionAdministrativeLabel(t)) return false;
  if (looksLikeDistrictAdministrativeLabel(t)) return false;
  if (containsForbiddenCityWords(t)) return false;
  return true;
}

export function isValidDetectedSettlement(name: string): boolean {
  return isCleanSettlementCandidate(name);
}

/** Rural / macro-like labels — treat as unsuitable for auto city label. */
export function looksLikeRuralAutoSettlement(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const markers = [
    "деревня",
    "село",
    "поселок",
    "посёлок",
    "хутор",
    "аул",
    "станица",
    "сельсовет",
    "район",
    "область",
    "республика",
    "горы",
    "море",
    "река",
  ];
  return markers.some((m) => n.includes(m));
}
