import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminUser } from "@/lib/security/admin";

const originalEnv = { ADMIN_USER_IDS: process.env.ADMIN_USER_IDS, ADMIN_USER_EMAILS: process.env.ADMIN_USER_EMAILS };
beforeEach(() => {
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_USER_EMAILS;
});
afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const makeUser = (overrides: Partial<NonNullable<Parameters<typeof isAdminUser>[0]>>): NonNullable<Parameters<typeof isAdminUser>[0]> => ({
  id: "user-1", email: "admin@example.com", email_confirmed_at: undefined, user_metadata: {}, ...overrides,
});

describe("admin allowlist checks", () => {
  it("allows ID-based admins without requiring email verification", () => {
    process.env.ADMIN_USER_IDS = "user-1";
    process.env.ADMIN_USER_EMAILS = "";
    expect(isAdminUser(makeUser({ id: "user-1" }))).toBe(true);
  });
  it("rejects unverified users even when their email is allowlisted", () => {
    process.env.ADMIN_USER_IDS = "";
    process.env.ADMIN_USER_EMAILS = "admin@example.com";
    expect(isAdminUser(makeUser({ id: "user-2", email_confirmed_at: undefined, user_metadata: {} }))).toBe(false);
  });
  it("allows verified users when their email is allowlisted", () => {
    process.env.ADMIN_USER_IDS = "";
    process.env.ADMIN_USER_EMAILS = "admin@example.com";
    expect(isAdminUser(makeUser({ id: "user-2", email_confirmed_at: "2026-01-01T00:00:00.000Z" }))).toBe(true);
  });
  it("ignores user_metadata.email_verified for an unconfirmed allowlisted email (audit reproduction)", () => {
    process.env.ADMIN_USER_EMAILS = "admin@example.test";
    for (const forged of [true, "true"]) {
      expect(isAdminUser(makeUser({ email: "admin@example.test", email_confirmed_at: undefined, user_metadata: { email_verified: forged } }))).toBe(false);
    }
  });
  it("accepts an allowlisted email confirmed by the auth server", () => {
    process.env.ADMIN_USER_EMAILS = "Admin@Example.test";
    expect(isAdminUser(makeUser({ email: "admin@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" }))).toBe(true);
  });
  it("allowlisted user ids remain the preferred, verification-independent path", () => {
    process.env.ADMIN_USER_IDS = "user-1";
    expect(isAdminUser(makeUser({ email: null as unknown as string }))).toBe(true);
  });
  it("a different confirmed email is never admin", () => {
    process.env.ADMIN_USER_EMAILS = "admin@example.test";
    expect(isAdminUser(makeUser({ id: "user-2", email: "attacker@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" }))).toBe(false);
  });
});
