import { describe, it, expect } from "vitest";
import { validateProfileInput } from "@/lib/profile/utils";

describe("validateProfileInput — handle hardening", () => {
  function v(handle: string) {
    return validateProfileInput({ firstName: "Jane", lastName: "Doe", handle });
  }

  it("rejects reserved words", () => {
    const reserved = ["admin", "root", "api", "system", "billing", "stripe", "support", "help"];
    for (const word of reserved) {
      const result = v(word);
      expect(result.ok, `"${word}" should be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Username not available.");
      }
    }
  });

  it("rejects all-underscore handles", () => {
    const result = v("___");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Username must contain a mix of characters.");
    }
  });

  it("rejects single-repeated-character handles", () => {
    const result = v("aaaa");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Username must contain a mix of characters.");
    }
  });

  it("allows legitimate handles", () => {
    expect(v("jane_doe").ok).toBe(true);
    expect(v("trader42").ok).toBe(true);
    expect(v("abc").ok).toBe(true);
  });
});
