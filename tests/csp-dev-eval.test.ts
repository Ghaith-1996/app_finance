import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";

// React needs eval() only in development (call-stack reconstruction). The production policy must
// never allow it.

async function scriptSrc(): Promise<string> {
  const rules = await nextConfig.headers!();
  const csp = rules[0].headers.find((header) => header.key === "Content-Security-Policy")!.value;
  return csp.split("; ").find((directive) => directive.startsWith("script-src"))!;
}

describe("Content-Security-Policy script-src", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows eval under next dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await scriptSrc()).toContain("'unsafe-eval'");
  });

  it("does not allow eval in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await scriptSrc()).not.toContain("'unsafe-eval'");
  });
});

describe("Content-Security-Policy configured Supabase origin", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function policy(url: string | undefined) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    const rules = await nextConfig.headers!();
    const directives = rules[0].headers.find((header) => header.key === "Content-Security-Policy")!.value.split("; ");
    return { directives, connections: directives.find((value) => value.startsWith("connect-src"))!.split(" ") };
  }

  it.each(["https://project.supabase.co", "https://database.example.invalid:8443/rest/v1"]) ("permits the configured HTTPS origin %s without dropping upgrades", async (url) => {
    const actual = await policy(url);
    expect(actual.connections).toContain(new URL(url).origin);
    expect(actual.directives).toContain("upgrade-insecure-requests");
  });

  it.each(["http://localhost:54321", "http://127.0.0.1:54321/rest/v1", "http://[::1]:54321", "http://supabase:8000"]) ("permits only the configured local HTTP origin %s without upgrading it", async (url) => {
    const actual = await policy(url);
    expect(actual.connections).toContain(new URL(url).origin);
    expect(actual.connections.filter((value) => value.startsWith("http://"))).toEqual([new URL(url).origin]);
    expect(actual.directives).not.toContain("upgrade-insecure-requests");
  });

  it.each([undefined, "", "not a URL", "http://database.example.invalid:54321", "http://localhost.evil.invalid", "ftp://localhost:54321", "javascript:alert(1)", "https://user:password@database.example.invalid", "http://user:password@localhost:54321", "https://*", "https://*.example.com", "https://a;upgrade-insecure-requests"]) ("retains the strict default for rejected/absent configuration %s", async (url) => {
    const actual = await policy(url);
    expect(actual.connections).toEqual(["connect-src", "'self'", "https://*.supabase.co", "https://challenges.cloudflare.com", "https://vercel.live"]);
    expect(actual.directives).toContain("upgrade-insecure-requests");
    expect(actual.directives.find((value) => value.startsWith("script-src"))).not.toContain("'unsafe-eval'");
  });
});
