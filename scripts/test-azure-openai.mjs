/**
 * Azure OpenAI smoke test for the Responses API.
 *
 * Runs two checks:
 *   1. Basic completion (single prompt)
 *   2. Article-chat simulation (system + history + question)
 *
 * Usage:  node --env-file=.env scripts/test-azure-openai.mjs
 *         node --env-file=.env scripts/test-azure-openai.mjs --chat-only
 */
const PLACEHOLDER_RE = /^your[- _]|^placeholder|^changeme|^sk-xxx|^xxx/i;

const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
const rawBaseUrl =
  process.env.AZURE_OPENAI_BASE_URL?.trim() ||
  process.env.AZURE_OPENAI_ENDPOINT?.trim() ||
  "";
const model =
  process.env.AZURE_OPENAI_MODEL?.trim() ||
  process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
  "gpt-5.2";
const reasoningEffort = process.env.AZURE_OPENAI_REASONING_EFFORT?.trim() || "medium";

function normalizeBaseUrl(raw) {
  const trimmed = raw.replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/openai/v1")) return `${trimmed}/`;
  if (trimmed.includes("/openai/")) return `${trimmed}/`;
  return `${trimmed}/openai/v1/`;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  for (const item of data?.output ?? []) {
    if (item?.type !== "message" || item?.role !== "assistant") continue;
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

/* ── Pre-flight checks ──────────────────────────────────────────────── */
console.log("=== Azure OpenAI Config Check ===\n");

const issues = [];

if (!apiKey) {
  issues.push("AZURE_OPENAI_API_KEY: missing");
} else if (PLACEHOLDER_RE.test(apiKey)) {
  issues.push(`AZURE_OPENAI_API_KEY: looks like a placeholder ("${apiKey.slice(0, 12)}…")`);
}
if (!rawBaseUrl) {
  issues.push("AZURE_OPENAI_BASE_URL: missing");
} else if (!/\.openai\.azure\.com/i.test(rawBaseUrl)) {
  issues.push(`AZURE_OPENAI_BASE_URL: expected *.openai.azure.com, got "${rawBaseUrl}"`);
}
if (!model) {
  issues.push("AZURE_OPENAI_MODEL: missing (must match your Azure deployment name)");
}

if (issues.length > 0) {
  console.error("Config issues found:");
  for (const i of issues) console.error(`  - ${i}`);
  console.error("\nFix these in .env before retrying.");
  process.exit(1);
}

const baseUrl = normalizeBaseUrl(rawBaseUrl);
console.log(`  Model/deployment : ${model}`);
console.log(`  Base URL         : ${baseUrl}`);
console.log(`  Reasoning effort : ${reasoningEffort}\n`);

const chatOnly = process.argv.includes("--chat-only");

/* ── Helper ─────────────────────────────────────────────────────────── */

async function callResponses(body, label) {
  console.log(`--- ${label} ---`);
  const res = await fetch(`${baseUrl}responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(`  HTTP ${res.status} ${res.statusText}`);

  if (!res.ok) {
    console.error(`  Error code : ${data?.error?.code ?? "(none)"}`);
    console.error(`  Error msg  : ${data?.error?.message ?? JSON.stringify(data)}`);
    return null;
  }

  const text = extractOutputText(data);
  if (!text) {
    console.error("  No assistant text returned.");
    console.error("  Full response:", JSON.stringify(data, null, 2));
    return null;
  }

  console.log(`  Reply: ${text}\n`);
  if (data.usage) {
    console.log(`  Usage: ${JSON.stringify(data.usage)}\n`);
  }
  return text;
}

/* ── Test 1: Basic prompt ───────────────────────────────────────────── */

if (!chatOnly) {
  const text = await callResponses(
    {
      model,
      instructions: "You are a concise financial assistant. Reply briefly with no markdown unless asked.",
      input: "In one sentence: if an investor holds AAPL and MSFT and headline says 'Big Tech faces new EU rules', what should they watch?",
      max_output_tokens: 256,
      reasoning: { effort: reasoningEffort },
    },
    "Test 1: Basic prompt",
  );
  if (!text) {
    console.error("\nBasic prompt failed. Fix the issue above before testing article chat.");
    process.exit(1);
  }
}

/* ── Test 2: Article-chat simulation (system + history + question) ── */

const chatResult = await callResponses(
  {
    model,
    instructions:
      "You are a portfolio news copilot. Analyze each article for market relevance, affected tickers, sentiment, portfolio impact, and what the investor should watch next. Be factual, concise, and cautious.",
    input: [
      {
        role: "user",
        content:
          "Article headline: AI infrastructure spend accelerates\n" +
          "Article body: Cloud providers are racing to expand GPU capacity, with capital expenditure rising 40% year-over-year.\n" +
          "Portfolio holdings: NVDA, MSFT, GOOGL\n\n" +
          "Question: What is the biggest risk this story creates for my portfolio?",
      },
    ],
    max_output_tokens: 350,
    reasoning: { effort: reasoningEffort },
  },
  "Test 2: Article chat simulation",
);

if (!chatResult) {
  console.error("\nArticle-chat simulation failed.");
  process.exit(1);
}

console.log("=== All checks passed ===");
