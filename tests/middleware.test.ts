import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const getUser = vi.fn();
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

  it("excludes api routes from the middleware matcher", async () => {
    const { config } = await import("@/middleware");

    expect(config.matcher).toContain(
      "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    );
  });
});
