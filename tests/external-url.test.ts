import { describe, expect, it } from "vitest";
import { sanitizeExternalUrl } from "@/lib/security/external-url";

describe("sanitizeExternalUrl", () => {
  it("allows http and https URLs", () => {
    expect(sanitizeExternalUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(sanitizeExternalUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("rejects dangerous or malformed URLs", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("data:text/html;base64,SGk=")).toBeNull();
    expect(sanitizeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(sanitizeExternalUrl("//example.com")).toBeNull();
    expect(sanitizeExternalUrl("/relative")).toBeNull();
    expect(sanitizeExternalUrl("not a url")).toBeNull();
  });
});
