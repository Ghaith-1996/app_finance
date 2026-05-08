import { describe, it, expect } from "vitest";
import {
  isValidInternalRedirect,
  sanitizeRedirect,
} from "@/lib/security/redirect";

describe("isValidInternalRedirect", () => {
  it("allows known app route prefixes", () => {
    expect(isValidInternalRedirect("/portfolio")).toBe(true);
    expect(isValidInternalRedirect("/portfolio/full")).toBe(true);
    expect(isValidInternalRedirect("/analysis")).toBe(true);
    expect(isValidInternalRedirect("/feed")).toBe(true);
    expect(isValidInternalRedirect("/home")).toBe(true);
    expect(isValidInternalRedirect("/watchlist")).toBe(true);
    expect(isValidInternalRedirect("/settings")).toBe(true);
    expect(isValidInternalRedirect("/admin")).toBe(true);
    expect(isValidInternalRedirect("/complete-profile")).toBe(true);
    expect(isValidInternalRedirect("/onboarding")).toBe(true);
    expect(isValidInternalRedirect("/pricing")).toBe(true);
    expect(isValidInternalRedirect("/digest/digest-1")).toBe(true);
  });

  it("allows paths with query strings", () => {
    expect(isValidInternalRedirect("/portfolio?tab=holdings")).toBe(true);
    expect(isValidInternalRedirect("/feed?symbol=AAPL")).toBe(true);
    expect(isValidInternalRedirect("/digest/digest-1?story=news-1")).toBe(true);
  });

  it("rejects absolute external URLs", () => {
    expect(isValidInternalRedirect("https://evil.com")).toBe(false);
    expect(isValidInternalRedirect("http://attacker.org/portfolio")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isValidInternalRedirect("//evil.com/portfolio")).toBe(false);
  });

  it("rejects URLs with embedded protocol", () => {
    expect(isValidInternalRedirect("/portfolio://evil.com")).toBe(false);
  });

  it("rejects unknown internal paths", () => {
    expect(isValidInternalRedirect("/api/secret")).toBe(false);
    expect(isValidInternalRedirect("/")).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(isValidInternalRedirect("")).toBe(false);
    expect(isValidInternalRedirect(null as unknown as string)).toBe(false);
    expect(isValidInternalRedirect(undefined as unknown as string)).toBe(false);
  });

  it("rejects paths that don't start with /", () => {
    expect(isValidInternalRedirect("portfolio")).toBe(false);
    expect(isValidInternalRedirect("javascript:alert(1)")).toBe(false);
  });
});

describe("sanitizeRedirect", () => {
  it("returns the path when valid", () => {
    expect(sanitizeRedirect("/portfolio", "/fallback")).toBe("/portfolio");
    expect(sanitizeRedirect("/feed?symbol=AAPL", "/fallback")).toBe("/feed?symbol=AAPL");
    expect(sanitizeRedirect("/digest/digest-1?story=news-1", "/fallback")).toBe("/digest/digest-1?story=news-1");
  });

  it("returns fallback for invalid paths", () => {
    expect(sanitizeRedirect("https://evil.com", "/portfolio")).toBe("/portfolio");
    expect(sanitizeRedirect("//evil.com", "/portfolio")).toBe("/portfolio");
    expect(sanitizeRedirect("/admin", "/portfolio")).toBe("/admin");
  });

  it("returns fallback for null/undefined", () => {
    expect(sanitizeRedirect(null, "/portfolio")).toBe("/portfolio");
    expect(sanitizeRedirect(undefined, "/portfolio")).toBe("/portfolio");
  });
});
