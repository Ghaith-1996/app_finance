import { BlockList, isIP } from "node:net";

/**
 * Outbound URL policy for publisher/company pages (audit S1).
 *
 * Addresses are classified with Node's canonical IP parser rather than string patterns:
 * - IPv4 must be outside every special-purpose range below.
 * - IPv6 must be global unicast (2000::/3) and outside the special ranges inside it. This rejects
 *   ::, ::1, IPv4-mapped/compatible forms (::ffff:0:0/96), NAT64 (64:ff9b::/96), link-local
 *   (fe80::/10, which includes fe90::), unique-local (fc00::/7) and multicast (ff00::/8).
 * - Only http/https on their default ports, with no embedded credentials.
 * The WHATWG URL parser canonicalizes decimal/octal/hex IPv4 hosts (e.g. http://2130706433/)
 * before these checks run. Use safePublicFetch (lib/security/safe-fetch.ts) to bind the checks
 * to the connection that is actually made.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

const BLOCKED_IPV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_IPV4.addSubnet(network, prefix, "ipv4");
}
// Cloud metadata endpoints outside the ranges above (e.g. Alibaba 100.100.100.200 is in 100.64/10 already).
BLOCKED_IPV4.addAddress("100.100.100.200", "ipv4");

const GLOBAL_UNICAST_IPV6 = new BlockList();
GLOBAL_UNICAST_IPV6.addSubnet("2000::", 3, "ipv6");

const BLOCKED_GLOBAL_IPV6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], // IETF protocol assignments, incl. Teredo 2001::/32 (embeds IPv4)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds IPv4)
  ["3fff::", 20], // documentation
] as const) {
  BLOCKED_GLOBAL_IPV6.addSubnet(network, prefix, "ipv6");
}

export const ALLOWED_PORTS = new Set(["", "80", "443"]);

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

function stripBrackets(value: string): string {
  return value.replace(/^\[|\]$/g, "");
}

/** True only for a syntactically valid, publicly routable unicast address. */
export function isPublicIpAddress(raw: string): boolean {
  const address = stripBrackets(raw.trim());
  const family = isIP(address);
  if (family === 4) return !BLOCKED_IPV4.check(address, "ipv4");
  if (family === 6) {
    return GLOBAL_UNICAST_IPV6.check(address, "ipv6") && !BLOCKED_GLOBAL_IPV6.check(address, "ipv6");
  }
  return false;
}

function isIpLiteral(hostname: string): boolean {
  return isIP(stripBrackets(hostname)) !== 0;
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
    if (!ALLOWED_PORTS.has(parsed.port)) {
      return { ok: false, reason: "unsupported_port" };
    }

    const hostname = parsed.hostname.trim().toLowerCase().replace(/\.$/, "");
    if (!hostname) {
      return { ok: false, reason: "missing_hostname" };
    }
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
      return { ok: false, reason: "blocked_hostname" };
    }
    if (isIpLiteral(hostname)) {
      return isPublicIpAddress(hostname) ? { ok: true } : { ok: false, reason: "blocked_ip" };
    }
    if (!hostname.includes(".")) {
      // Single-label names resolve via local search domains / internal DNS.
      return { ok: false, reason: "blocked_hostname" };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
}

async function resolvePublicHostname(
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
      if (!isPublicIpAddress(address)) {
        return { ok: false, reason: "blocked_resolved_ip" };
      }
    }

    return resolvedAny ? { ok: true } : { ok: false, reason: "dns_resolution_failed" };
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }
}

/**
 * Preflight check (syntax + every DNS answer public). This alone cannot stop DNS rebinding,
 * because the connection may resolve again; safePublicFetch re-checks at connect time.
 */
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
