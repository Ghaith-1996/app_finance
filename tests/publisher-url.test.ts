import { describe, expect, it } from "vitest";
import {
  assertSafePublicUrl,
  validatePublisherUrl,
} from "@/lib/security/publisher-url";

describe("validatePublisherUrl", () => {
  it("allows public http and https URLs", () => {
    expect(validatePublisherUrl("https://example.com/article").ok).toBe(true);
    expect(validatePublisherUrl("http://news.example.com/article").ok).toBe(true);
  });

  it("rejects unsupported schemes", () => {
    expect(validatePublisherUrl("file:///tmp/test").ok).toBe(false);
    expect(validatePublisherUrl("ftp://example.com/file").ok).toBe(false);
  });

  it("rejects localhost and internal IP targets", () => {
    expect(validatePublisherUrl("http://localhost:3000").ok).toBe(false);
    expect(validatePublisherUrl("http://127.0.0.1:3000").ok).toBe(false);
    expect(validatePublisherUrl("http://[::1]/").ok).toBe(false);
    expect(validatePublisherUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validatePublisherUrl("http://10.0.0.5/article").ok).toBe(false);
    expect(validatePublisherUrl("http://192.168.1.10/article").ok).toBe(false);
  });

  it("rejects credential-bearing URLs", () => {
    expect(validatePublisherUrl("https://user:pass@example.com").ok).toBe(false);
  });

  it("accepts hostnames that resolve only to public IPs", async () => {
    const result = await assertSafePublicUrl("https://example.com/article", {
      lookupImpl: async () => [{ address: "93.184.216.34" }],
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects hostnames that resolve to blocked private or metadata IPs", async () => {
    const privateResult = await assertSafePublicUrl("https://example.com/article", {
      lookupImpl: async () => [{ address: "10.0.0.10" }],
    });
    const metadataResult = await assertSafePublicUrl("https://example.com/article", {
      lookupImpl: async () => [{ address: "169.254.169.254" }],
    });

    expect(privateResult).toEqual({ ok: false, reason: "blocked_resolved_ip" });
    expect(metadataResult).toEqual({ ok: false, reason: "blocked_resolved_ip" });
  });
});
