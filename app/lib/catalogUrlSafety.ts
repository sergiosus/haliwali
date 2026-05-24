import { lookup } from "dns/promises";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("fc") || n.startsWith("fd")) return true;
  if (n.startsWith("fe80")) return true;
  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("INVALID_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("UNSUPPORTED_PROTOCOL");
  }
  if (url.username || url.password) throw new Error("CREDENTIALS_FORBIDDEN");
  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host)) throw new Error("BLOCKED_HOST");
  if (host.endsWith(".local") || host.endsWith(".internal")) throw new Error("BLOCKED_HOST");
  return url;
}

export async function assertPublicResolvableHost(url: URL): Promise<void> {
  const host = url.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIpv4(host)) throw new Error("PRIVATE_IP");
    return;
  }
  if (host.includes(":")) {
    if (isPrivateIpv6(host)) throw new Error("PRIVATE_IP");
    return;
  }
  const records = await lookup(host, { all: true });
  for (const r of records) {
    if (r.family === 4 && isPrivateIpv4(r.address)) throw new Error("PRIVATE_IP");
    if (r.family === 6 && isPrivateIpv6(r.address)) throw new Error("PRIVATE_IP");
  }
}
