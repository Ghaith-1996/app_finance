import { describe, it, expect } from "vitest";
import { isTimingSafeEqual } from "@/lib/security/timing";

describe("isTimingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(isTimingSafeEqual("secret123", "secret123")).toBe(true);
  });

  it("returns true for empty strings", () => {
    expect(isTimingSafeEqual("", "")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(isTimingSafeEqual("secret123", "secret456")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(isTimingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("returns false when one string is empty", () => {
    expect(isTimingSafeEqual("secret", "")).toBe(false);
    expect(isTimingSafeEqual("", "secret")).toBe(false);
  });

  it("handles Bearer token format", () => {
    const secret = "my-cron-secret-xyz";
    expect(isTimingSafeEqual(`Bearer ${secret}`, `Bearer ${secret}`)).toBe(true);
    expect(isTimingSafeEqual(`Bearer wrong`, `Bearer ${secret}`)).toBe(false);
  });
});
