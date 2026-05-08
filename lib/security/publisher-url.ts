const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

const BLOCKED_METADATA_IPS = new Set([
  "100.100.100.200",
  "169.254.169.254",
  "169.254.170.2",
]);

const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt("0.0.0.0"), ipToInt("0.255.255.255")],
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("100.64.0.0"), ipToInt("100.127.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.0.0.0"), ipToInt("192.0.0.255")],
  [ipToInt("192.0.2.0"), ipToInt("192.0.2.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  [ipToInt("198.18.0.0"), ipToInt("198.19.255.255")],
  [ipToInt("198.51.100.0"), ipToInt("198.51.100.255")],
  [ipToInt("203.0.113.0"), ipToInt("203.0.113.255")],
  [ipToInt("224.0.0.0"), ipToInt("255.255.255.255")],
];

const BLOCKED_IPV6_PATTERNS = [
  /^::$/i,
  /^::1$/i,
  /^fe80:/i,
  /^fc/i,
  /^fd/i,
];

export interface PublisherUrlValidationResult {
  ok: boolean;
  reason?: string;
}

export type PublisherHostnameLookup = (
  hostname: string,
  options?: { all?: boolean; verbatim?: boolean },
) => Promise<Array<{ address: string }>>;

async function defaultHostnameLookup(
  hostname: string,
  options?: { all?: boolean; verbatim?: boolean },
): Promise<Array<{ address: string }>> {
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(hostname, {
    all: options?.all ?? true,
    verbatim: options?.verbatim ?? true,
  });

  return (Array.isArray(results) ? results : [results]).map((result) => ({
    address: result.address,
  }));
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  if (BLOCKED_METADATA_IPS.has(hostname)) return true;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true;
  const value = ipToInt(hostname);
  return BLOCKED_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return BLOCKED_IPV6_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function isBlockedIpAddress(hostname: string): boolean {
  return isBlockedIpv4(hostname) || isBlockedIpv6(hostname);
}

export function validatePublisherUrl(raw: string | null | undefined): PublisherUrlValidationResult {
  if (!raw) return { ok: false, reason: "missing" };

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "unsupported_scheme" };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, reason: "credentials_not_allowed" };
    }

    const hostname = parsed.hostname.trim().toLowerCase();
    if (!hostname) {
      return { ok: false, reason: "missing_hostname" };
    }
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
      return { ok: false, reason: "blocked_hostname" };
    }
    if (isBlockedIpAddress(hostname)) {
      return { ok: false, reason: "blocked_ip" };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
}

export async function resolvePublicHostname(
  hostname: string,
  lookupImpl: PublisherHostnameLookup = defaultHostnameLookup,
): Promise<PublisherUrlValidationResult> {
  try {
    const results = await lookupImpl(hostname, { all: true, verbatim: true });
    let resolvedAny = false;

    for (const result of results) {
      const address = result.address?.trim();
      if (!address) continue;

      resolvedAny = true;
      if (isBlockedIpAddress(address)) {
        return { ok: false, reason: "blocked_resolved_ip" };
      }
    }

    return resolvedAny ? { ok: true } : { ok: false, reason: "dns_resolution_failed" };
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }
}

export async function assertSafePublicUrl(
  raw: string | null | undefined,
  options?: { lookupImpl?: PublisherHostnameLookup },
): Promise<PublisherUrlValidationResult> {
  const validation = validatePublisherUrl(raw);
  if (!validation.ok || !raw) {
    return validation;
  }

  const parsed = new URL(raw.trim());
  const hostname = parsed.hostname.trim().toLowerCase();
  if (isIpLiteral(hostname)) {
    return { ok: true };
  }

  return resolvePublicHostname(hostname, options?.lookupImpl);
}
