import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { discoverCompanyEarningsLink } from "@/lib/services/earnings-reports";
import {
  assertSafePublicUrl,
  isPublicIpAddress,
  validatePublisherUrl,
} from "@/lib/security/publisher-url";
import { createSafeLookup, safePublicFetch, UnsafeDestinationError } from "@/lib/security/safe-fetch";

// Audit S1. Everything here uses fake DNS and a fake transport; no network connection is made.

describe("canonical IP classification", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
  ])("allows public %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    ["loopback v4", "127.0.0.1"],
    ["private 10/8", "10.1.2.3"],
    ["private 172.16/12", "172.31.255.255"],
    ["private 192.168/16", "192.168.1.1"],
    ["CGNAT", "100.64.0.1"],
    ["metadata", "169.254.169.254"],
    ["this-network", "0.0.0.0"],
    ["multicast v4", "224.0.0.1"],
    ["reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["unspecified v6", "::"],
    ["loopback v6", "::1"],
    ["mapped loopback (dotted)", "::ffff:127.0.0.1"],
    ["mapped loopback (hex)", "::ffff:7f00:1"],
    ["mapped metadata", "::ffff:a9fe:a9fe"],
    ["mapped public is still not global unicast", "::ffff:8.8.8.8"],
    ["IPv4-compatible", "::127.0.0.1"],
    ["link-local fe80", "fe80::1"],
    ["link-local fe90 (inside fe80::/10)", "fe90::1"],
    ["link-local febf", "febf::1"],
    ["unique local fc00", "fc00::1"],
    ["unique local fd", "fd12:3456::1"],
    ["multicast v6", "ff02::1"],
    ["NAT64", "64:ff9b::7f00:1"],
    ["6to4 embedding loopback", "2002:7f00:1::1"],
    ["Teredo", "2001:0:4136:e378::1"],
    ["documentation v6", "2001:db8::1"],
    ["not an IP", "example.com"],
  ])("rejects %s (%s)", (_label, address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });
});

describe("validatePublisherUrl", () => {
  it.each([
    "https://investor.example.com/q3",
    "http://example.com:80/",
    "https://example.com:443/",
    "https://8.8.8.8/",
    "https://[2606:4700:4700::1111]/",
  ])("allows %s", (url) => {
    expect(validatePublisherUrl(url)).toEqual({ ok: true });
  });

  it.each([
    ["mapped loopback", "http://[::ffff:127.0.0.1]/private", "blocked_ip"],
    ["mapped metadata", "http://[::ffff:169.254.169.254]/metadata", "blocked_ip"],
    ["fe90 link-local", "http://[fe90::1]/private", "blocked_ip"],
    ["decimal loopback", "http://2130706433/", "blocked_ip"],
    ["hex loopback", "http://0x7f.0.0.1/", "blocked_ip"],
    ["octal loopback", "http://0177.0.0.1/", "blocked_ip"],
    ["short loopback", "http://127.1/", "blocked_ip"],
    ["localhost", "http://localhost/", "blocked_hostname"],
    ["localhost trailing dot", "http://localhost./", "blocked_hostname"],
    ["sub.localhost", "http://api.localhost/", "blocked_hostname"],
    ["single-label host", "http://intranet/", "blocked_hostname"],
    ["metadata host", "http://metadata.google.internal/", "blocked_hostname"],
    ["non-default port", "https://example.com:8443/", "unsupported_port"],
    ["ssh port", "http://example.com:22/", "unsupported_port"],
    ["ftp", "ftp://example.com/", "unsupported_scheme"],
    ["file", "file:///etc/passwd", "unsupported_scheme"],
    ["credentials", "https://user:pass@example.com/", "credentials_not_allowed"],
  ])("rejects %s", (_label, url, reason) => {
    expect(validatePublisherUrl(url)).toEqual({ ok: false, reason });
  });
});

describe("assertSafePublicUrl DNS answers", () => {
  it("rejects when any answer is private", async () => {
    const lookupImpl = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }, { address: "::ffff:10.0.0.1" }]);
    await expect(assertSafePublicUrl("https://mixed.example.com/", { lookupImpl })).resolves.toEqual({
      ok: false,
      reason: "blocked_resolved_ip",
    });
  });

  it("accepts all-public answers", async () => {
    const lookupImpl = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }, { address: "2606:2800:220:1::1" }]);
    await expect(assertSafePublicUrl("https://ok.example.com/", { lookupImpl })).resolves.toEqual({ ok: true });
  });
});

/** Fake http(s).request that performs the connect-time lookup like Node does. */
function createFakeTransport(responder: (address: string) => { status: number; body: string; headers?: Record<string, string> }) {
  const connected: string[] = [];
  const requestImpl = vi.fn((url: URL, options: { lookup: (...args: unknown[]) => void }) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error?: Error) => void };
    request.destroy = (error?: Error) => {
      if (error) request.emit("error", error);
    };
    request.end = () => {
      options.lookup(url.hostname, { all: true }, (error: Error | null, addresses: Array<{ address: string }>) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        const address = addresses[0].address;
        connected.push(address);
        const { status, body, headers } = responder(address);
        const incoming = Object.assign(new PassThrough(), { statusCode: status, headers: headers ?? {} });
        request.emit("response", incoming);
        incoming.end(body);
      });
    };
    return request;
  });
  return { requestImpl, connected };
}

describe("safePublicFetch binds validation to the connection", () => {
  it("never reaches the transport for a prohibited literal destination", async () => {
    const { requestImpl } = createFakeTransport(() => ({ status: 200, body: "secret" }));
    await expect(
      safePublicFetch("http://[::ffff:7f00:1]/private", { requestImpl: requestImpl as never }),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
    expect(requestImpl).not.toHaveBeenCalled();
  });

  it("refuses a hostname whose answer changes to a private address at connect time (rebinding)", async () => {
    const answers = [
      [{ address: "93.184.216.34", family: 4 }],
      [{ address: "169.254.169.254", family: 4 }],
    ];
    const resolver = vi.fn(async () => answers.shift() ?? []);
    const { requestImpl, connected } = createFakeTransport(() => ({ status: 200, body: "ok" }));

    const first = await safePublicFetch("https://rebind.example.com/", { requestImpl: requestImpl as never, resolver });
    expect(await first.text()).toBe("ok");
    await expect(
      safePublicFetch("https://rebind.example.com/", { requestImpl: requestImpl as never, resolver }),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
    expect(connected).toEqual(["93.184.216.34"]);
  });

  it("enforces the response size limit", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const { requestImpl } = createFakeTransport(() => ({ status: 200, body: "x".repeat(2_000) }));
    await expect(
      safePublicFetch("https://big.example.com/", { requestImpl: requestImpl as never, resolver, maxBytes: 1_000 }),
    ).rejects.toThrow(/exceeded 1000 bytes/);
  });

  it("enforces the timeout", async () => {
    const resolver = () => new Promise<never>(() => {});
    const { requestImpl } = createFakeTransport(() => ({ status: 200, body: "" }));
    await expect(
      safePublicFetch("https://slow.example.com/", { requestImpl: requestImpl as never, resolver, timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/);
  });

  it("does not follow redirects itself", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const { requestImpl } = createFakeTransport(() => ({
      status: 302,
      body: "",
      headers: { location: "http://[::ffff:7f00:1]/" },
    }));
    const response = await safePublicFetch("https://hop.example.com/", { requestImpl: requestImpl as never, resolver });
    expect(response.status).toBe(302);
    expect(requestImpl).toHaveBeenCalledTimes(1);
  });

  it("createSafeLookup supports single-address callers", async () => {
    const lookup = createSafeLookup(async () => [{ address: "8.8.8.8", family: 4 }]);
    const result = await new Promise<[unknown, unknown, unknown]>((resolve) =>
      lookup("dns.example.com", {}, (error, address, family) => resolve([error, address, family])),
    );
    expect(result).toEqual([null, "8.8.8.8", 4]);
  });
});

describe("earnings discovery redirect (audit S1 reproduction)", () => {
  it("does not request a redirect target that is a mapped private address", async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      return new Response(null, { status: 302, headers: { location: "http://[::ffff:7f00:1]/private" } });
    });
    const lookupImpl = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);

    const result = await discoverCompanyEarningsLink("https://issuer.example/", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl,
    });

    expect(result).toBeNull();
    expect(requested).toEqual(["https://issuer.example/"]);
  });
});
