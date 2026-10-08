import { describe, expect, it } from "vitest";

import {
  isProfileComplete,
  validateProfileInput,
} from "@/lib/profile/utils";

describe("profile utils", () => {
  it("normalizes and validates first name, last name, and handle", () => {
    const result = validateProfileInput({
      firstName: " Ada ",
      lastName: " Lovelace ",
      handle: "@Ada_L",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "Lovelace",
        handle: "ada_l",
        displayName: "Ada Lovelace",
      },
    });
  });

  it("rejects invalid usernames", () => {
    const result = validateProfileInput({
      firstName: "Ada",
      lastName: "Lovelace",
      handle: "Not Valid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/username must be 3-20 characters/i);
    }
  });

  it("checks profile completeness from required fields only", () => {
    expect(
      isProfileComplete({
        firstName: "Ada",
        lastName: "Lovelace",
        handle: "ada",
        acceptedTermsAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);

    expect(
      isProfileComplete({
        firstName: "Ada",
        lastName: "",
        handle: "ada",
        acceptedTermsAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);

    expect(
      isProfileComplete({
        firstName: "Ada",
        lastName: "Lovelace",
        handle: "ada",
        acceptedTermsAt: null,
      }),
    ).toBe(false);

    expect(isProfileComplete(null)).toBe(false);
  });
});
