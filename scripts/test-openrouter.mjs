/**
 * Quick OpenRouter smoke test (StepFun Step 3.5 Flash free by default).
 * Run: node --env-file=.env scripts/test-openrouter.mjs
 *
 * Reasoning models may return `message.content` null and put text in `message.reasoning`,
 * or burn the whole max_tokens on reasoning. We send `reasoning.exclude` and a generous
 * max_tokens so the visible answer lands in `content`.
 */
const key = process.env.OPENROUTER_API_KEY;
const model =
  process.env.OPENROUTER_MODEL?.trim() ||
  "stepfun/step-3.5-flash:free";

if (!key) {
  console.error("Missing OPENROUTER_API_KEY in environment (.env).");
  process.exit(1);
}

function extractAssistantText(message) {
  if (!message) return "";
  const c = typeof message.content === "string" ? message.content.trim() : "";
  if (c) return c;
  const r = typeof message.reasoning === "string" ? message.reasoning.trim() : "";
  return r || "";
}

const body = {
  model,
  messages: [
    {
      role: "system",
      content:
        "You are a concise financial assistant. Reply briefly with no markdown unless asked.",
    },
    {
      role: "user",
      content:
        "In one sentence: if an investor holds AAPL and MSFT and headline says 'Big Tech faces new EU rules', what should they watch?",
    },
  ],
  max_tokens: 512,
  reasoning: { exclude: true },
};

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    ...(process.env.OPENROUTER_HTTP_REFERER && {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER,
    }),
    "X-Title": process.env.OPENROUTER_APP_NAME || "Pulsefolio test",
  },
  body: JSON.stringify(body),
});

const data = await res.json();
console.log("HTTP", res.status, res.statusText);
console.log("Model:", model);

if (!res.ok) {
  console.error("Error body:", JSON.stringify(data, null, 2));
  process.exit(1);
}

const text = extractAssistantText(data.choices?.[0]?.message);
if (!text) {
  console.error(
    "No assistant text in content or reasoning. Raw message:",
    JSON.stringify(data.choices?.[0]?.message, null, 2),
  );
  console.error("Full response:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\n--- Assistant reply ---\n");
console.log(text);
console.log("\n--- Usage (if present) ---");
console.log(JSON.stringify(data.usage ?? {}, null, 2));
