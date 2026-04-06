import { afterEach, describe, expect, it } from "vitest";

import { isAdminUser } from "@/lib/security/admin";

const ORIGINAL_ADMIN_USER_IDS = process.env.ADMIN_USER_IDS;
const ORIGINAL_ADMIN_USER_EMAILS = process.env.ADMIN_USER_EMAILS;

afterEach(() => {
  process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_USER_IDS;
  process.env.ADMIN_USER_EMAILS = ORIGINAL_ADMIN_USER_EMAILS;
});

describe("admin allowlist checks", () => {
  const makeUser = (
    overrides: Partial<NonNullable<Parameters<typeof isAdminUser>[0]>>,
  ): NonNullable<Parameters<typeof isAdminUser>[0]> => ({
    id: "user-1",
    email: "admin@example.com",
    email_confirmed_at: undefined,
    user_metadata: {},
    ...overrides,
  });

  it("allows ID-based admins without requiring email verification", () => {
    process.env.ADMIN_USER_IDS = "user-1";
    process.env.ADMIN_USER_EMAILS = "";

    expect(isAdminUser(makeUser({ id: "user-1" }))).toBe(true);
  });

  it("rejects unverified users even when their email is allowlisted", () => {
    process.env.ADMIN_USER_IDS = "";
    process.env.ADMIN_USER_EMAILS = "admin@example.com";

    expect(
      isAdminUser(
        makeUser({
          id: "user-2",
          email_confirmed_at: undefined,
          user_metadata: {},
        }),
      ),
    ).toBe(false);
  });

  it("allows verified users when their email is allowlisted", () => {
    process.env.ADMIN_USER_IDS = "";
    process.env.ADMIN_USER_EMAILS = "admin@example.com";

    expect(
      isAdminUser(
        makeUser({
          id: "user-2",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        }),
      ),
    ).toBe(true);
  });
});
