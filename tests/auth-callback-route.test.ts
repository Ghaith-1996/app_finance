import { beforeEach, describe, expect, it, vi } from "vitest";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  handle: string | null;
} | null;

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();

const currentSupabase = {
  auth: {
    exchangeCodeForSession,
    getUser,
  },
  from(table: string) {
    if (table !== "user_profiles") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
    };
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

import { GET } from "@/app/auth/callback/route";

function mockProfile(profile: ProfileRow) {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({
    data: {
      user: {
        id: "user-1",
      },
    },
  });
  maybeSingle.mockResolvedValue({ data: profile });
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    maybeSingle.mockReset();
  });

  it("redirects incomplete profiles to the profile completion page", async () => {
    mockProfile({
      first_name: "Ada",
      last_name: null,
      handle: "ada",
    });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc&redirectTo=/home"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/complete-profile?redirectTo=%2Fhome",
    );
  });

  it("redirects completed profiles to the requested destination", async () => {
    mockProfile({
      first_name: "Ada",
      last_name: "Lovelace",
      handle: "ada",
    });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc&redirectTo=/home"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/home");
  });

  it("falls back to the auth error redirect when session exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc&redirectTo=/home"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback_error",
    );
  });
});
