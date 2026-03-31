import { describe, expect, it } from "vitest";

import {
  defaultHandle,
  deriveNamesFromMetadata,
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

  it("derives names from full_name metadata when split fields are absent", () => {
    expect(deriveNamesFromMetadata({ full_name: "Grace Hopper" })).toEqual({
      firstName: "Grace",
      lastName: "Hopper",
    });
  });

  it("builds a default handle from preferred username or email", () => {
    expect(
      defaultHandle({
        email: "person@example.com",
        user_metadata: { preferred_username: "Trader_One" },
      }),
    ).toBe("trader_one");

    expect(
      defaultHandle({
        email: "person@example.com",
        user_metadata: {},
      }),
    ).toBe("person");
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
