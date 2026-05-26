export function hasCatalogCoordinates(input: {
  latitude: number | null;
  longitude: number | null;
}): input is { latitude: number; longitude: number } {
  return (
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude) &&
    input.latitude >= -90 &&
    input.latitude <= 90 &&
    input.longitude >= -180 &&
    input.longitude <= 180
  );
}

export function validCatalogAddress(address: string | null | undefined): string {
  const value = String(address ?? "").replace(/\s+/g, " ").trim();
  return value.length >= 3 ? value : "";
}

export function catalogYandexMapsHref(input: {
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  city?: string | null;
}): string | null {
  if (hasCatalogCoordinates(input)) {
    return `https://yandex.ru/maps/?pt=${input.longitude},${input.latitude}&z=16&l=map`;
  }

  const address = validCatalogAddress(input.address);
  if (!address) return null;

  const city = String(input.city ?? "").replace(/\s+/g, " ").trim();
  const query = city && !address.toLowerCase().includes(city.toLowerCase()) ? `${city}, ${address}` : address;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(query)}`;
}

