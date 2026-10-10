import { test as base, expect, type BrowserContext } from "@playwright/test";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";

export const gateway = "http://supabase:8000";
export const appOrigin = "http://127.0.0.1:3000";
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const admin = createClient(gateway, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
export type LocalUser = { id: string; email: string; password: string; client: SupabaseClient };
type Fixture = { users: { a: LocalUser; b: LocalUser }; proof: (assertion: string, value?: unknown) => void; networkAudit: void };

export function httpFixtures(scenario: string, responses: Record<string, unknown>[] = []) {
  writeFileSync(process.env.E2E_HTTP_FIXTURES!, JSON.stringify({ scenario, responses }));
}

export function yahooQuoteFixtures(symbols: string[]) {
  return [
    { origin: "https://finance.yahoo.com", method: "GET", path: "/quote/AAPL", headers: { "content-type": "text/html", "set-cookie": "A3=e2e-cookie; Domain=.yahoo.com; Path=/; Secure" }, body: "<html>Local Yahoo transport fixture</html>" },
    { origin: "https://query1.finance.yahoo.com", method: "GET", path: "/v1/test/getcrumb", headers: { "content-type": "text/plain" }, body: "e2e-crumb" },
    { origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v7/finance/quote", body: { quoteResponse: { error: null, result: symbols.map((symbol) => ({
      symbol, shortName: `Fixture ${symbol}`, language: "en-US", region: "US", quoteType: "EQUITY", triggerable: true,
      marketState: "REGULAR", tradeable: false, exchange: "NMS", exchangeTimezoneName: "America/New_York", exchangeTimezoneShortName: "EDT",
      gmtOffSetMilliseconds: -14400000, market: "us_market", esgPopulated: false, sourceInterval: 15, exchangeDataDelayedBy: 0,
      fullExchangeName: "NasdaqGS", currency: "USD", regularMarketPrice: 20, regularMarketPreviousClose: 19,
      regularMarketTime: Math.floor(Date.now() / 1000), regularMarketChange: 1, regularMarketChangePercent: 5.263,
    })) } } },
  ];
}

export function yahooSearchFixtures(symbols: string[]) {
  return symbols.map((symbol) => ({
    origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v1/finance/search", query: { q: symbol },
    body: { quotes: [{ symbol, shortname: `Fixture ${symbol}`, exchange: "NMS", quoteType: "EQUITY", typeDisp: "equity", score: 1, index: "quotes", isYahooFinance: true }], news: [], nav: [], lists: [], explains: [], researchReports: [], screenerFieldResults: [], count: 1, totalTime: 1, timeTakenForQuotes: 1, timeTakenForNews: 1, timeTakenForAlgowatchlist: 1, timeTakenForPredefinedScreener: 1, timeTakenForCrunchbase: 1, timeTakenForNav: 1, timeTakenForResearchReports: 1, timeTakenForScreenerField: 1, timeTakenForCulturalAssets: 1, timeTakenForSearchLists: 1 },
  }));
}

export async function completeProfile(user: LocalUser) {
  const result = await admin.from("user_profiles").upsert({ user_id: user.id, first_name: "Fixture", last_name: "Alpha", display_name: "Fixture Alpha", handle: `alpha_${user.id.slice(0, 8)}`, accepted_terms_at: new Date().toISOString() });
  expect(result.error).toBeNull();
}

export async function seedPortfolio(user: LocalUser, symbols = ["AAA"]) {
  const saved = await user.client.rpc("save_portfolio_holdings", {
    p_portfolio_id: null, p_portfolio_name: "Fixture portfolio", p_source_type: "manual", p_mode: "replace",
    p_holdings: symbols.map((symbol) => ({ symbol, company: `Fixture ${symbol}`, quantity: 1, averageCost: 10 })),
  });
  expect(saved.error).toBeNull();
  expect((await admin.from("portfolios").update({ last_synced_at: new Date().toISOString() }).eq("id", saved.data)).error).toBeNull();
  return saved.data as string;
}

export async function createLocalSession(context: BrowserContext, user: LocalUser) {
  const jar: { name: string; value: string; options?: CookieOptions }[] = [];
  const client = createServerClient(gateway, anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => { for (const cookie of cookies) { const previous = jar.findIndex((c) => c.name === cookie.name); if (previous >= 0) jar.splice(previous, 1); jar.push(cookie); } },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || data.user?.id !== user.id) throw new Error("Real local Auth sign-in failed");
  await context.addCookies(jar.map(({ name, value, options = {} }) => ({
    name, value, domain: options.domain ?? "127.0.0.1", path: options.path ?? "/",
    httpOnly: options.httpOnly ?? false, secure: options.secure ?? false,
    sameSite: options.sameSite === "strict" ? "Strict" as const : options.sameSite === "none" ? "None" as const : "Lax" as const,
    ...(options.maxAge !== undefined ? { expires: Math.floor(Date.now() / 1000) + options.maxAge } : options.expires ? { expires: Math.floor(options.expires.getTime() / 1000) } : {}),
  })));
  return { userId: data.user.id };
}

export const test = base.extend<Fixture>({
  networkAudit: [async ({}, use) => {
    const start = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).length;
    await use();
    const rows = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).slice(start).map((line) => JSON.parse(line));
    expect(rows.filter((row) => row.status === "blocked"), "Unregistered provider HTTP must fail even when product catches its network error").toEqual([]);
    expect(rows.flatMap((row) => row.checks ?? []).filter((check) => !check.passed), "Actual provider payload assertions").toEqual([]);
  }, { auto: true }],
  users: async ({}, use, info) => {
    const made: LocalUser[] = [];
    try {
      for (const label of ["a", "b"]) {
        const adminScenario = label === "a" && /^E2E-(11|12):/.test(info.title);
        const email = `${label}-${process.env.E2E_RUN_ID}${adminScenario ? "" : `-${randomUUID()}`}@example.invalid`;
        const password = `e2e-${randomUUID()}`;
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error("Local admin seed failed");
        const client = createClient(gateway, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error("Local user sign-in failed");
        made.push({ id: data.user.id, email, password, client });
      }
      await use({ a: made[0], b: made[1] });
    } finally {
      for (const user of made) await admin.auth.admin.deleteUser(user.id);
    }
  },
  proof: async ({}, use, info) => {
    await use((assertion, value) => appendFileSync("/proof/assertions.jsonl", JSON.stringify({ scenario: info.title, assertion, value }) + "\n"));
  },
  context: async ({ context }, use) => {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      const origin = url.origin;
      if (origin === "https://challenges.cloudflare.com" && url.pathname === "/turnstile/v0/api.js") {
        return route.fulfill({ contentType: "application/javascript", body: `
          (() => {
            const callbacks = new Map(); let next = 0;
            window.turnstile = {
              render(element, options) { const id = String(++next); callbacks.set(id, options.callback); setTimeout(() => options.callback('e2e-widget-response'), 0); return id; },
              reset(id) { setTimeout(() => callbacks.get(id)?.('e2e-widget-response'), 0); },
              remove(id) { callbacks.delete(id); }
            };
            window.onTurnstileLoad?.();
          })();` });
      }
      // Next reconstructs request.url as localhost for callback redirects; both
      // loopback names address this container's single owned Next server.
      if ([appOrigin, "http://localhost:3000", "http://127.0.0.1:3001", gateway].includes(origin)) return route.continue();
      appendFileSync(process.env.E2E_LEDGER!, JSON.stringify({ transport: "browser", method: route.request().method(), path: url.pathname, status: "blocked" }) + "\n");
      return route.abort("blockedbyclient");
    });
    await use(context);
  },
});
export { expect };
