import { afterEach, describe, expect, it } from "vitest";

import { isAdminUser } from "@/lib/security/admin";

// Audit S2: user-editable metadata never grants admin; only the server-owned confirmation does.

describe("admin email verification (S2)", () => {
  afterEach(() => {
    delete process.env.ADMIN_USER_EMAILS;
    delete process.env.ADMIN_USER_IDS;
  });

  it("ignores user_metadata.email_verified for an unconfirmed allowlisted email (audit reproduction)", () => {
    process.env.ADMIN_USER_EMAILS = "admin@example.test";
    for (const forged of [true, "true"]) {
      expect(
        isAdminUser({
          id: "user-1",
          email: "admin@example.test",
          email_confirmed_at: undefined,
          user_metadata: { email_verified: forged },
        }),
      ).toBe(false);
    }
  });

  it("accepts an allowlisted email confirmed by the auth server", () => {
    process.env.ADMIN_USER_EMAILS = "Admin@Example.test";
    expect(
      isAdminUser({ id: "user-1", email: "admin@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" }),
    ).toBe(true);
  });

  it("allowlisted user ids remain the preferred, verification-independent path", () => {
    process.env.ADMIN_USER_IDS = "user-1";
    expect(isAdminUser({ id: "user-1", email: null as unknown as string })).toBe(true);
  });

  it("a different confirmed email is never admin", () => {
    process.env.ADMIN_USER_EMAILS = "admin@example.test";
    expect(
      isAdminUser({ id: "user-2", email: "attacker@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });
});
