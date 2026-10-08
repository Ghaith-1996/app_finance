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
