import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const getUser = vi.fn();
const profileMaybeSingle = vi.fn();
const createServerClient = vi.fn(
  (
    _url?: string,
    _key?: string,
    _options?: {
      cookies: {
        getAll: () => unknown[];
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: unknown }>) => void;
      };
    },
  ) => ({
    auth: {
      getSession,
      getUser,
    },
    from(_table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: profileMaybeSingle,
          }),
        }),
      };
    },
  }),
);

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    key: string,
    options: {
      cookies: {
        getAll: () => unknown[];
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: unknown }>) => void;
      };
    },
  ) => createServerClient(url, key, options),
}));

function mockAuthenticatedSession() {
  getSession.mockResolvedValue({
    data: {
      session: {
        user: { id: "user-1" },
      },
    },
  });
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("uses session-based auth checks for protected routes", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/feed"));

    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login");
  });

  it("treats /admin as a protected path", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/admin"));

    expect(response.headers.get("location")).toContain("/login?redirectTo=%2Fadmin");
  });

  it("redirects authenticated users with incomplete profile to /complete-profile", async () => {
    mockAuthenticatedSession();
    profileMaybeSingle.mockResolvedValue({
      data: {
        first_name: "Ada",
        last_name: null,
        handle: "ada",
        accepted_terms_at: null,
      },
    });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/feed"));

    expect(response.headers.get("location")).toContain("/complete-profile?redirectTo=%2Ffeed");
  });

  it("redirects authenticated users who have not accepted ToS to /complete-profile", async () => {
    mockAuthenticatedSession();
    profileMaybeSingle.mockResolvedValue({
      data: {
        first_name: "Ada",
        last_name: "Lovelace",
        handle: "ada",
        accepted_terms_at: null,
      },
    });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/portfolio"));

    expect(response.headers.get("location")).toContain("/complete-profile?redirectTo=%2Fportfolio");
  });

  it("allows authenticated users with complete profile through protected routes", async () => {
    mockAuthenticatedSession();
    profileMaybeSingle.mockResolvedValue({
      data: {
        first_name: "Ada",
        last_name: "Lovelace",
        handle: "ada",
        accepted_terms_at: "2026-01-01T00:00:00Z",
      },
    });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/feed"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not check profile completeness for /complete-profile", async () => {
    mockAuthenticatedSession();
    // profileMaybeSingle should NOT be called for exempt paths
    profileMaybeSingle.mockResolvedValue({ data: null });

    const { middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost/complete-profile"));

    expect(profileMaybeSingle).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("excludes api routes from the middleware matcher", async () => {
    const { config } = await import("@/middleware");

    expect(config.matcher).toContain(
      "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    );
  });
});
