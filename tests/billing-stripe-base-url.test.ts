import { afterEach, describe, expect, it } from "vitest";

import { getAppBaseUrl } from "@/lib/billing/stripe";

const ORIGINAL_APP_BASE_URL = process.env.APP_BASE_URL;
const ORIGINAL_NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const ORIGINAL_NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const ORIGINAL_APP_TRUSTED_ORIGINS = process.env.APP_TRUSTED_ORIGINS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env = {
    ...process.env,
    APP_BASE_URL: ORIGINAL_APP_BASE_URL,
    NEXT_PUBLIC_SITE_URL: ORIGINAL_NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: ORIGINAL_NEXT_PUBLIC_APP_URL,
    APP_TRUSTED_ORIGINS: ORIGINAL_APP_TRUSTED_ORIGINS,
    NODE_ENV: ORIGINAL_NODE_ENV,
  };
});

describe("getAppBaseUrl", () => {
  it("prefers trusted configured env over request origin", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    process.env.APP_BASE_URL = "https://app.example.com/";
    process.env.APP_TRUSTED_ORIGINS = "https://spoofed.example.com";

    const baseUrl = getAppBaseUrl(
      new Request("https://spoofed.example.com/api/billing/checkout"),
    );

    expect(baseUrl).toBe("https://app.example.com");
  });

  it("allows request-origin fallback only when explicitly allowlisted", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    process.env.APP_BASE_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example.com";

    const trusted = getAppBaseUrl(
      new Request("https://trusted.example.com/api/billing/checkout"),
    );
    const untrusted = getAppBaseUrl(
      new Request("https://evil.example.com/api/billing/checkout"),
    );

    expect(trusted).toBe("https://trusted.example.com");
    expect(untrusted).toBe("http://localhost:3000");
  });
});
