/**
 * Centralized environment validation.
 *
 * Feature-gated variables are checked lazily by the functions that need them
 * so local dev without certain keys still works.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
      `Check .env and .env.example for setup instructions.`,
    );
  }
  return value;
}

function warnOnce(name: string, feature: string): void {
  if (typeof window !== "undefined") return;
  if (!process.env[name]) {
    console.warn(`[env] ${name} is not set. ${feature} will be unavailable.`);
  }
}

/** Supabase URL — required at runtime. */
export function requireSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

/** Supabase anon key — required at runtime. */
export function requireSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function requireFinnhubKey(): string {
  return requireEnv("FINNHUB_API_KEY");
}

export function requireTwelveDataKey(): string {
  return requireEnv("TWELVE_DATA_API_KEY");
}

export function hasKey(name: string): boolean {
  return !!process.env[name];
}

/** Run once on server startup to emit warnings for optional provider keys. */
export function checkOptionalProviders(): void {
  warnOnce("FINNHUB_API_KEY", "Watchlist search and Finnhub news");
  warnOnce("TWELVE_DATA_API_KEY", "Watchlist detail dashboard");
  warnOnce("TURNSTILE_SECRET_KEY", "Turnstile bot protection on write endpoints");
}

/** True when TURNSTILE_SECRET_KEY is set (non-empty). */
export function hasTurnstileSecret(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY?.trim();
}

/** True when the client-side site key is set. */
export function hasTurnstileSiteKey(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
}

const PLACEHOLDER_RE = /^your[- _]|^placeholder|^changeme|^sk-xxx|^xxx/i;
const AZURE_HOST_RE = /\.openai\.azure\.com/i;

export interface AzureConfigIssue {
  field: string;
  reason: string;
}

export interface AzureConfigResult {
  ok: boolean;
  issues: AzureConfigIssue[];
  key: string;
  baseUrl: string;
  model: string;
}

export interface MistralConfigIssue {
  field: string;
  reason: string;
}

export interface MistralConfigResult {
  ok: boolean;
  issues: MistralConfigIssue[];
  key: string;
  model: string;
}

export function validateAzureConfig(): AzureConfigResult {
  const issues: AzureConfigIssue[] = [];

  const rawKey = process.env.AZURE_OPENAI_API_KEY?.trim() ?? "";
  const rawUrl =
    process.env.AZURE_OPENAI_BASE_URL?.trim() ||
    process.env.AZURE_OPENAI_ENDPOINT?.trim() ||
    "";
  const rawModel =
    process.env.AZURE_OPENAI_MODEL?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    "";

  if (!rawKey) {
    issues.push({ field: "AZURE_OPENAI_API_KEY", reason: "missing" });
  } else if (PLACEHOLDER_RE.test(rawKey)) {
    issues.push({ field: "AZURE_OPENAI_API_KEY", reason: "placeholder value — replace with a real Azure API key" });
  }

  if (!rawUrl) {
    issues.push({ field: "AZURE_OPENAI_BASE_URL", reason: "missing" });
  } else if (!AZURE_HOST_RE.test(rawUrl)) {
    issues.push({
      field: "AZURE_OPENAI_BASE_URL",
      reason: `expected *.openai.azure.com host, got "${rawUrl.replace(/https?:\/\//, "").split("/")[0]}"`,
    });
  }

  if (!rawModel) {
    issues.push({ field: "AZURE_OPENAI_MODEL", reason: "missing — must match the Azure deployment name" });
  }

  return {
    ok: issues.length === 0,
    issues,
    key: rawKey,
    baseUrl: rawUrl,
    model: rawModel,
  };
}

export function validateMistralConfig(): MistralConfigResult {
  const issues: MistralConfigIssue[] = [];

  const rawKey = process.env.MISTRAL_API_KEY?.trim() ?? "";
  const rawModel = process.env.MISTRAL_MODEL?.trim() || "mistral-large-latest";

  if (!rawKey) {
    issues.push({ field: "MISTRAL_API_KEY", reason: "missing" });
  } else if (PLACEHOLDER_RE.test(rawKey)) {
    issues.push({
      field: "MISTRAL_API_KEY",
      reason: "placeholder value — replace with a real Mistral API key",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    key: rawKey,
    model: rawModel,
  };
}
