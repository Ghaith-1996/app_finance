import { test, expect, createLocalSession, completeProfile, admin, gateway, anonKey, httpFixtures } from "./fixtures";
import { execFileSync } from "node:child_process";

test.describe.configure({ mode: "serial" });

test("E2E-00: public navigation, legal contact and page titles", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-00", ["premium", "ultimate"].map((plan) => ({
    origin: "https://api.stripe.com", method: "GET", path: `/v1/prices/price_e2e_${plan}`,
    body: { id: `price_e2e_${plan}`, object: "price", active: true, currency: "usd", unit_amount: 2000, recurring: { interval: "month" } },
  })));
  await page.goto("/");
  for (const href of ["/login", "/pricing", "/terms", "/privacy"]) await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  await page.goto("/terms");
  await expect(page.locator('a[href="mailto:ghaith.alali1996@gmail.com"]').first()).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in - Pulsefolio");
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  for (const [path, title] of [["/feed", "Feed"], ["/portfolio", "Portfolio"], ["/portfolio/full", "Full portfolio"], ["/watchlist", "Watchlist"], ["/settings", "Settings"], ["/analysis", "Analysis"], ["/pricing", "Pricing"], ["/terms", "Terms of Service"]]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} - Pulsefolio`);
  }
  proof("public destinations, configured legal mailto and nine real document titles", true);
});

test("foundation: real Auth, RLS, RPC and browser gateway", async ({ page, context, users, proof }) => {
  httpFixtures("foundation-browser");
  const created = await users.a.client.rpc("save_portfolio_holdings", {
    p_portfolio_id: null, p_portfolio_name: "Owned A", p_source_type: "manual", p_mode: "replace",
    p_holdings: [{ symbol: "AAA", company: "Fixture Alpha", quantity: 2, averageCost: 10 }],
  });
  expect(created.error).toBeNull();
  const portfolioId = created.data;
  const readA = await users.a.client.from("holdings").select("symbol,quantity").eq("portfolio_id", portfolioId);
  expect(readA.error).toBeNull();
  expect(readA.data).toEqual([{ symbol: "AAA", quantity: 2 }]);
  const readB = await users.b.client.from("holdings").select("symbol").eq("portfolio_id", portfolioId);
  expect(readB.error).toBeNull();
  expect(readB.data).toEqual([]);
  const writeB = await users.b.client.rpc("save_portfolio_holdings", {
    p_portfolio_id: portfolioId, p_portfolio_name: "Stolen", p_source_type: "manual", p_mode: "replace",
    p_holdings: [{ symbol: "BBB", company: "Fixture Beta", quantity: 3, averageCost: 20 }],
  });
  expect(writeB.error?.code).toBe("42501");
  expect((await admin.from("holdings").select("symbol,quantity").eq("portfolio_id", portfolioId)).data).toEqual(readA.data);
  proof("GoTrue sessions A/B, user RPC, owner read, cross-owner denial and unchanged durable state", true);
  const tokenA = (await users.a.client.auth.getSession()).data.session!.access_token;
  const tokenB = (await users.b.client.auth.getSession()).data.session!.access_token;
  const pythonProof = `
import os, requests, subprocess, sys
base = 'http://supabase:8000'
headers = {'apikey': os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY'], 'Authorization': 'Bearer ' + os.environ['E2E_TOKEN_A']}
assert requests.get(base + '/auth/v1/user', headers=headers).json()['id'] == os.environ['E2E_USER_A']
path = '/rest/v1/holdings?select=symbol,quantity&portfolio_id=eq.' + os.environ['E2E_PORTFOLIO']
assert requests.get(base + path, headers=headers).json() == [{'symbol':'AAA','quantity':2}]
headers['Authorization'] = 'Bearer ' + os.environ['E2E_TOKEN_B']
assert requests.get(base + path, headers=headers).json() == []
payload = {'p_portfolio_id':os.environ['E2E_PORTFOLIO'],'p_portfolio_name':'Denied','p_source_type':'manual','p_mode':'replace','p_holdings':[{'symbol':'BBB','quantity':3,'averageCost':20}]}
assert requests.post(base + '/rest/v1/rpc/save_portfolio_holdings', headers=headers, json=payload).json()['code'] == '42501'
`;
  execFileSync("python", ["-c", pythonProof + `\nsubprocess.run([sys.executable, '-c', ${JSON.stringify(pythonProof)}], check=True)\n`], {
    env: { ...process.env, E2E_TOKEN_A: tokenA, E2E_TOKEN_B: tokenB, E2E_USER_A: users.a.id, E2E_PORTFOLIO: portfolioId },
    stdio: "pipe", timeout: 20_000,
  });
  proof("Python parent/child Auth, REST, RPC and RLS passthrough", true);
  await createLocalSession(context, users.a);
  await page.goto("/complete-profile");
  await expect(page.getByRole("textbox", { name: /Username @ Use 3-20/ })).toBeVisible();
  const policyViolations: string[] = [];
  page.on("console", (message) => { if (message.text().includes("Content Security Policy")) policyViolations.push(message.text().replace(/https?:\/\/[^\s'\"]+/g, "[origin]")); });
  const status = await page.evaluate(async ({ gateway, anonKey }) => {
    try { return (await fetch(`${gateway}/auth/v1/health`, { headers: { apikey: anonKey } })).status; }
    catch { return 0; }
  }, { gateway, anonKey });
  proof("browser gateway status and CSP", { status, policyViolations });
  expect(status, "Browser must reach the same real local gateway without CSP bypass").toBe(200);
});

test("E2E-01: profile persists, real session renews and logout closes private UI", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-01");
  await createLocalSession(context, users.a);
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/complete-profile/);
  await page.getByPlaceholder("First name").fill("Fixture");
  await page.getByPlaceholder("Last name").fill("Alpha");
  await page.getByRole("textbox", { name: /Username @ Use 3-20/ }).fill(`alpha_${users.a.id.slice(0, 8)}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/portfolio/);
  await page.reload();
  const profile = await users.a.client.from("user_profiles").select("first_name,last_name,accepted_terms_at").eq("user_id", users.a.id).single();
  expect(profile.error).toBeNull();
  expect(profile.data).toMatchObject({ first_name: "Fixture", last_name: "Alpha" });
  expect(profile.data?.accepted_terms_at).toBeTruthy();
  expect((await users.a.client.auth.refreshSession()).error).toBeNull();
  expect((await users.a.client.auth.getUser()).data.user?.id).toBe(users.a.id);
  await page.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/login/);
  proof("profile durable, Auth refresh and UI logout", true);
});

test("E2E-02: dated CSV preview and real replace import", async ({ page, context, users, proof }) => {
  await admin.from("user_profiles").upsert({ user_id: users.a.id, first_name: "Fixture", last_name: "Alpha", display_name: "Fixture Alpha", handle: `alpha_${users.a.id.slice(0, 8)}`, accepted_terms_at: new Date().toISOString() });
  const results = ["AAA", "BBB"].map((symbol) => ({
    origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v1/finance/search", query: { q: symbol },
    body: { quotes: [{ symbol, shortname: `Fixture ${symbol}`, exchange: "NMS", quoteType: "EQUITY", typeDisp: "equity", score: 1, index: "quotes", isYahooFinance: true }], news: [], nav: [], lists: [], explains: [], researchReports: [], screenerFieldResults: [], count: 1, totalTime: 1, timeTakenForQuotes: 1, timeTakenForNews: 1, timeTakenForAlgowatchlist: 1, timeTakenForPredefinedScreener: 1, timeTakenForCrunchbase: 1, timeTakenForNav: 1, timeTakenForResearchReports: 1, timeTakenForScreenerField: 1, timeTakenForCulturalAssets: 1, timeTakenForSearchLists: 1 },
  }));
  httpFixtures("E2E-02", results);
  await createLocalSession(context, users.a);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Import CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "positions.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Quantity,Average Cost,Date\nAAA,2,10,2026-10-02\nBBB,3,20,2026-10-02\n") });
  await expect(page.getByText("2 confirmed, 0 unresolved, 0 skipped")).toBeVisible();
  await expect(page.getByText("Ready to save", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save holdings", exact: true }).click();
  await expect.poll(async () => (await users.a.client.from("holdings").select("symbol,quantity,average_cost").order("symbol")).data).toEqual([
    { symbol: "AAA", quantity: 2, average_cost: 10 }, { symbol: "BBB", quantity: 3, average_cost: 20 },
  ]);
  proof("dated positions preserve quantities/costs through preview, action, RPC and RLS", true);
});
