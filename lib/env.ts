import "server-only";

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

export function requireDigestCronSecret(): string {
  return requireEnv("DIGEST_CRON_SECRET");
}

export function requireResendApiKey(): string {
  return requireEnv("RESEND_API_KEY");
}

export function requireTwilioAccountSid(): string {
  return requireEnv("TWILIO_ACCOUNT_SID");
}

export function requireTwilioAuthToken(): string {
  return requireEnv("TWILIO_AUTH_TOKEN");
}

export function requireTwilioMessagingServiceSid(): string {
  return requireEnv("TWILIO_MESSAGING_SERVICE_SID");
}

const PLACEHOLDER_RE = /^your[- _]|^placeholder|^changeme|^sk-xxx|^xxx/i;
const AZURE_HOST_RE = /\.openai\.azure\.com/i;

interface AzureConfigIssue {
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

interface MistralConfigIssue {
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
