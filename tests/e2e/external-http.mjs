// Disposable runner preload; production code never imports this file.
import { readFileSync, appendFileSync } from "node:fs";
import { setupServer } from "msw/node";
import { http, HttpResponse, passthrough } from "msw";
import https from "node:https";
import { createConnection } from "node:net";
if (!process.env.E2E_HTTP_FIXTURES || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://supabase:8000") {
  throw new Error("E2E requires the owned internal gateway and fixtures");
}
const counts = new Map();
setupServer(http.all("*", async ({ request }) => {
  const url = new URL(request.url);
  if (["http://supabase:8000", "http://127.0.0.1:3000", "http://127.0.0.1:3001"].includes(url.origin)) return passthrough();
  const fixture = JSON.parse(readFileSync(process.env.E2E_HTTP_FIXTURES, "utf8"));
  const key = `${fixture.scenario}:${request.method}:${url.origin}${url.pathname}`;
  const ordinal = (counts.get(key) ?? 0) + 1;
  counts.set(key, ordinal);
  const needsPayload = fixture.responses.some((r) => r.requestContains || r.requestAssertions || r.capturePhoneCode);
  const payload = needsPayload ? await request.clone().text() : "";
  const row = fixture.responses.find((r) => r.origin === url.origin && r.method === request.method && r.path === url.pathname && (!r.query || Object.entries(r.query).every(([k, v]) => url.searchParams.get(k) === v)) && (!r.ordinal || r.ordinal === ordinal) && (!r.requestContains || payload.includes(r.requestContains)));
  if (row?.capturePhoneCode) {
    const code = new URLSearchParams(payload).get("Body")?.match(/verification code is (\d{6})\./)?.[1];
    if (!code) throw new Error("Expected verification SMS at registered transport");
    await new Promise((resolve, reject) => {
      const socket = createConnection("/tmp/pulsefolio-e2e-phone.sock");
      socket.on("error", reject);
      socket.on("connect", () => socket.end(code));
      socket.on("close", resolve);
    });
  }
  const checks = (row?.requestAssertions ?? []).map(({ label, needle, count, minimum }) => {
    const occurrences = payload.split(needle).length - 1;
    return { label, passed: minimum === undefined ? occurrences === count : occurrences >= minimum };
  }).concat(Object.entries(row?.requestHeaders ?? {}).map(([name, value]) => ({ label: `header ${name}`, passed: request.headers.get(name) === value })));
  appendFileSync(process.env.E2E_LEDGER, JSON.stringify({ transport: "node", pid: process.pid, scenario: fixture.scenario, method: request.method, path: url.pathname, ordinal, fixtureLabel: row?.label ?? null, status: row?.status ?? (row ? 200 : "blocked"), checks }) + "\n");
  if (checks.some((check) => !check.passed)) return HttpResponse.error();
  if (!row || row.networkError) return HttpResponse.error();
  if (row.delay) await new Promise((resolve) => setTimeout(resolve, row.delay));
  return new HttpResponse(typeof row.body === "string" ? row.body : JSON.stringify(row.body), { status: row.status ?? 200, headers: row.headers ?? { "content-type": "application/json" } });
})).listen({ onUnhandledRequest: "error" });

// Stripe 21 writes its request only after secureConnect; MSW's synthetic socket
// emits that event only after seeing a request. Break this transport deadlock
// solely for MSW's socket to the external Stripe host. Never touch real sockets,
// Supabase transport, SDK request generation, parsing, retries or factories.
https.request = new Proxy(https.request, {
  apply(target, thisArg, args) {
    const request = Reflect.apply(target, thisArg, args);
    if (args[0]?.host === "api.stripe.com") {
      request.prependOnceListener("socket", (socket) => {
        if (socket.constructor.name !== "MockHttpSocket") request.destroy(new Error("Stripe canary requires an intercepted socket"));
        else socket.connecting = false;
      });
    }
    return request;
  },
});
