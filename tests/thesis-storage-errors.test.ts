import { describe, expect, it } from "vitest";

import { describeThesisStorageError } from "@/lib/investment-theses/utils";

// Audit F04: database/schema errors are never shown verbatim; a missing table disables the feature.

describe("describeThesisStorageError", () => {
  it.each([
    [{ code: "PGRST205", message: "Could not find the table 'public.user_investment_theses' in the schema cache" }],
    [{ code: "42P01", message: 'relation "user_investment_theses" does not exist' }],
    [{ code: undefined, message: "Could not find the table 'public.x' in the schema cache" }],
  ])("marks missing storage as unavailable without leaking the raw error (%o)", (error) => {
    const described = describeThesisStorageError(error);
    expect(described.unavailable).toBe(true);
    expect(described.message).not.toMatch(/schema cache|public\.|relation|user_investment/i);
  });

  it("maps other failures to a generic retry message", () => {
    const described = describeThesisStorageError({ code: "XX000", message: "internal error at line 3" });
    expect(described).toEqual({
      message: "We couldn't load or save this thesis right now. Please try again.",
      unavailable: false,
    });
  });
});
