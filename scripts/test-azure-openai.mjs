/**
 * Quick Azure OpenAI smoke test for a GPT-5.2 deployment.
 * Run: node --env-file=.env scripts/test-azure-openai.mjs
 */
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

if (!apiKey) {
  console.error("Missing AZURE_OPENAI_API_KEY in environment (.env).");
  process.exit(1);
}

if (!rawBaseUrl) {
  console.error("Missing AZURE_OPENAI_BASE_URL in environment (.env).");
  process.exit(1);
}

const baseUrl = normalizeBaseUrl(rawBaseUrl);

const body = {
  model,
  instructions: "You are a concise financial assistant. Reply briefly with no markdown unless asked.",
  input:
    "In one sentence: if an investor holds AAPL and MSFT and headline says 'Big Tech faces new EU rules', what should they watch?",
  max_output_tokens: 256,
  reasoning: { effort: reasoningEffort },
};

const res = await fetch(`${baseUrl}responses`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "api-key": apiKey,
  },
  body: JSON.stringify(body),
});

const data = await res.json();
console.log("HTTP", res.status, res.statusText);
console.log("Model/deployment:", model);
console.log("Base URL:", baseUrl);

if (!res.ok) {
  console.error("Error body:", JSON.stringify(data, null, 2));
  process.exit(1);
}

const text = extractOutputText(data);
if (!text) {
  console.error("No assistant text returned. Full response:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\n--- Assistant reply ---\n");
console.log(text);
console.log("\n--- Usage (if present) ---");
console.log(JSON.stringify(data.usage ?? {}, null, 2));
