import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_BACKUP = { ...process.env };

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
});
