import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_BACKUP = { ...process.env };

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ENV_BACKUP };
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
  });

  it("requireFinnhubKey throws when FINNHUB_API_KEY is missing", async () => {
    delete process.env.FINNHUB_API_KEY;
    const { requireFinnhubKey } = await import("@/lib/env");
    expect(() => requireFinnhubKey()).toThrow("FINNHUB_API_KEY");
  });

  it("requireFinnhubKey returns value when set", async () => {
    process.env.FINNHUB_API_KEY = "fk_test";
    const { requireFinnhubKey } = await import("@/lib/env");
    expect(requireFinnhubKey()).toBe("fk_test");
  });

  it("requireTwelveDataKey throws when TWELVE_DATA_API_KEY is missing", async () => {
    delete process.env.TWELVE_DATA_API_KEY;
    const { requireTwelveDataKey } = await import("@/lib/env");
    expect(() => requireTwelveDataKey()).toThrow("TWELVE_DATA_API_KEY");
  });

  it("requireTwelveDataKey returns value when set", async () => {
    process.env.TWELVE_DATA_API_KEY = "td_test";
    const { requireTwelveDataKey } = await import("@/lib/env");
    expect(requireTwelveDataKey()).toBe("td_test");
  });

  it("hasKey returns true when variable exists", async () => {
    process.env.FINNHUB_API_KEY = "yes";
    const { hasKey } = await import("@/lib/env");
    expect(hasKey("FINNHUB_API_KEY")).toBe(true);
  });

  it("hasKey returns false when variable is absent", async () => {
    delete process.env.SOME_MISSING_KEY;
    const { hasKey } = await import("@/lib/env");
    expect(hasKey("SOME_MISSING_KEY")).toBe(false);
  });
});

describe("validateAzureConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ENV_BACKUP };
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
  });

  it("reports missing key", async () => {
    delete process.env.AZURE_OPENAI_API_KEY;
    process.env.AZURE_OPENAI_BASE_URL = "https://myresource.openai.azure.com";
    process.env.AZURE_OPENAI_MODEL = "gpt-5.2";
    const { validateAzureConfig } = await import("@/lib/env");
    const result = validateAzureConfig();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "AZURE_OPENAI_API_KEY" && i.reason === "missing")).toBe(true);
  });

  it("reports placeholder key", async () => {
    process.env.AZURE_OPENAI_API_KEY = "your-azure-openai-api-key";
    process.env.AZURE_OPENAI_BASE_URL = "https://myresource.openai.azure.com";
    process.env.AZURE_OPENAI_MODEL = "gpt-5.2";
    const { validateAzureConfig } = await import("@/lib/env");
    const result = validateAzureConfig();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "AZURE_OPENAI_API_KEY" && /placeholder/i.test(i.reason))).toBe(true);
  });

  it("reports non-Azure host", async () => {
    process.env.AZURE_OPENAI_API_KEY = "abc123realkey";
    process.env.AZURE_OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.AZURE_OPENAI_MODEL = "gpt-5.2";
    const { validateAzureConfig } = await import("@/lib/env");
    const result = validateAzureConfig();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "AZURE_OPENAI_BASE_URL")).toBe(true);
  });

  it("passes with valid config", async () => {
    process.env.AZURE_OPENAI_API_KEY = "abc123realkey";
    process.env.AZURE_OPENAI_BASE_URL = "https://myresource.openai.azure.com";
    process.env.AZURE_OPENAI_MODEL = "gpt-5.2";
    const { validateAzureConfig } = await import("@/lib/env");
    const result = validateAzureConfig();
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe("validateMistralConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ENV_BACKUP };
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
  });

  it("reports missing key", async () => {
    delete process.env.MISTRAL_API_KEY;
    const { validateMistralConfig } = await import("@/lib/env");
    const result = validateMistralConfig();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "MISTRAL_API_KEY" && i.reason === "missing")).toBe(true);
  });

  it("reports placeholder key", async () => {
    process.env.MISTRAL_API_KEY = "your-mistral-api-key";
    const { validateMistralConfig } = await import("@/lib/env");
    const result = validateMistralConfig();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "MISTRAL_API_KEY" && /placeholder/i.test(i.reason))).toBe(true);
  });

  it("passes with valid config", async () => {
    process.env.MISTRAL_API_KEY = "mistral-real-key";
    process.env.MISTRAL_MODEL = "mistral-large-latest";
    const { validateMistralConfig } = await import("@/lib/env");
    const result = validateMistralConfig();
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.model).toBe("mistral-large-latest");
  });
});
