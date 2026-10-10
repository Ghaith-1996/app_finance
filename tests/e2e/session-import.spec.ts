import { test, expect, createLocalSession, completeProfile, admin, gateway, anonKey, httpFixtures, yahooQuoteFixtures, yahooSearchFixtures, seedPortfolio } from "./fixtures";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });

test("E2E-02: exact ambiguous no-match and failed Yahoo preserve CSV order company and market", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  const exact = yahooSearchFixtures(["aaa"])[0];
  const template = yahooSearchFixtures(["DDDD"])[0];
  httpFixtures("E2E-02-Yahoo-variants", [
    { ...exact, label: "Yahoo-AAA", query: { q: "AAA" } },
    { ...yahooSearchFixtures(["CCC"])[0], label: "Yahoo-CCCC", query: { q: "CCCC" } },
    { ...template, label: "Yahoo-DDDD", body: { ...template.body, quotes: [], count: 0 } },
    { origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v1/finance/search", query: { q: "EEEE" }, label: "Yahoo-EEEE", status: 503, body: { error: "Fixture Yahoo unavailable" } },
  ]);
  const ledgerStart = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).length;
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Import CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "resolution.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Company,Market,Quantity,Average Cost\naaa,Preserved AAA,PRESET,2,10\nCCCC,,OLD,3,20\nDDDD,Preserved no match,LOCAL,4,30\nEEEE,Preserved error,LOCAL,5,40\n") });
  await expect(page.getByText("3 confirmed, 1 unresolved, 0 skipped")).toBeVisible();
  const rows = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Skip", exact: true }) });
  await expect(rows).toHaveCount(4);
  const text = await rows.allTextContents();
  expect(text[0]).toContain("AAA"); expect(text[0]).toContain("Preserved AAA"); expect(text[0]).toContain("PRESET");
  expect(text[1]).toContain("CCCC"); expect(text[1]).toContain("OLD");
  expect(text[2]).toContain("DDDD"); expect(text[2]).toContain("Preserved no match"); expect(text[2]).toContain("LOCAL");
  expect(text[3]).toContain("EEEE"); expect(text[3]).toContain("Preserved error"); expect(text[3]).toContain("LOCAL");
  await page.getByRole("button", { name: "CCC Fixture CCC", exact: true }).click();
  await expect(page.getByText("4 confirmed, 0 unresolved, 0 skipped")).toBeVisible();
  const resolved = await rows.allTextContents();
  expect(resolved[1]).toContain("CCC"); expect(resolved[1]).toContain("Fixture CCC"); expect(resolved[1]).toContain("NMS");
  expect(resolved[0]).toContain("Preserved AAA"); expect(resolved[2]).toContain("DDDD"); expect(resolved[3]).toContain("EEEE");
  const ledger = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).slice(ledgerStart).map((line) => JSON.parse(line));
  expect(ledger.filter((row) => row.path === "/v1/finance/search").map((row) => row.fixtureLabel)).toEqual(["Yahoo-AAA", "Yahoo-CCCC", "Yahoo-DDDD", "Yahoo-EEEE"]);
  expect((await users.a.client.from("holdings").select("id")).data).toEqual([]);
  proof("real Yahoo SDK exact casefold/nonexact choice/no-match/error; CSV order and supplied company/market preserved; four request fixture identities in draft order", true);
});

test("E2E-02: manual onboarding keeps selected candidates unresolved until numeric inputs and preserves two review updates", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  httpFixtures("E2E-02-manual-issues", [...yahooSearchFixtures(["AAA", "BBB"]), ...yahooQuoteFixtures(["AAA", "BBB"])]);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Create manually/ }).click();
  for (const symbol of ["AAA", "BBB"]) {
    await page.getByPlaceholder("Search ticker or company...").fill(symbol);
    await page.getByRole("button", { name: new RegExp(`${symbol}.*Fixture ${symbol}`) }).click();
  }
  await expect(page.getByPlaceholder("e.g. 50")).toHaveCount(2);
  await page.getByPlaceholder("e.g. 50").nth(1).fill("3");
  await page.getByPlaceholder("e.g. 142.50").nth(1).fill("7");
  await page.getByRole("button", { name: "Review holdings", exact: true }).click();
  const invalid = page.getByRole("row").filter({ has: page.getByText("AAA", { exact: true }) });
  await expect(invalid.getByText("Enter quantity", { exact: true })).toBeVisible();
  await expect(invalid.getByText("Enter average cost", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save portfolio", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Skip", exact: true }).evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
  await expect(page.getByText("Skipped", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Include", exact: true }).evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
  await expect(invalid.getByText("Enter quantity", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toHaveCount(1);
  await invalid.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Save portfolio", exact: true }).click();
  await expect.poll(async () => (await users.a.client.from("holdings").select("symbol,quantity,average_cost")).data).toEqual([{ symbol: "BBB", quantity: 3, average_cost: 7 }]);
  proof("manual candidate intake retains numeric issues; two same-task review updates and skip/include preserve correct Save gate and BBB-only durable save", true);
});

test("E2E-02: candidate selection preserves numeric issues and rapid draft changes in onboarding and existing CSV", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  httpFixtures("E2E-02-rapid-candidates", [
    ...["XX", "YY"].map((query, index) => ({ ...yahooSearchFixtures([index ? "BBB" : "AAA"])[0], query: { q: query } })),
    ...yahooQuoteFixtures(["AAA", "BBB"]),
  ]);
  let portfolioId: string | null = null;
  let savedAction: { payload: string; headers: Record<string, string> } | null = null;
  for (const surface of ["onboarding", "existing"] as const) {
    await page.goto(surface === "onboarding" ? "/onboarding" : `/portfolio/full?portfolioId=${portfolioId}`);
    await page.getByRole("button", { name: /Import CSV/ }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "ambiguous.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Quantity,Average Cost\nXX,0,0\nYY,2,20\n") });
    await expect(page.getByText("0 confirmed, 2 unresolved, 0 skipped")).toBeVisible();
    const candidates = page.getByRole("button", { name: /^(AAA Fixture AAA|BBB Fixture BBB)$/ });
    await expect(candidates).toHaveCount(2);
    // Both real click events run in the same browser task, before React commits.
    await candidates.evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
    await expect(page.getByText("1 confirmed, 1 unresolved, 0 skipped")).toBeVisible();
    const invalid = page.getByRole("row").filter({ has: page.getByText("AAA", { exact: true }) });
    await expect(invalid.getByText("Missing or zero quantity", { exact: true })).toBeVisible();
    await expect(invalid.getByText("Missing or zero average cost", { exact: true })).toBeVisible();
    await expect(page.getByText(/not found exactly/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save holdings", exact: true })).toBeDisabled();
    await invalid.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByText("1 confirmed, 0 unresolved, 1 skipped")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save holdings", exact: true })).toBeEnabled();
    await invalid.getByRole("button", { name: "Include", exact: true }).click();
    await expect(page.getByText("1 confirmed, 1 unresolved, 0 skipped")).toBeVisible();
    const skips = page.getByRole("button", { name: "Skip", exact: true });
    await skips.evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
    await expect(page.getByText("0 confirmed, 0 unresolved, 2 skipped")).toBeVisible();
    const includes = page.getByRole("button", { name: "Include", exact: true });
    await includes.evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
    await expect(page.getByText("1 confirmed, 1 unresolved, 0 skipped")).toBeVisible();
    await invalid.getByRole("button", { name: "Skip", exact: true }).click();
    const saveRequest = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) && Boolean(request.postData()?.includes('"holdings"')));
    await page.getByRole("button", { name: "Save holdings", exact: true }).click();
    const outgoing = await saveRequest;
    if (surface === "existing") await expect(page.getByRole("button", { name: "Import CSV", exact: true })).toBeVisible();
    else await expect(page).toHaveURL((url) => url.pathname === "/analysis");
    savedAction = { payload: outgoing.postData()!, headers: { "next-action": outgoing.headers()["next-action"], "content-type": outgoing.headers()["content-type"] } };
    await expect.poll(async () => (await users.a.client.from("holdings").select("symbol,quantity,average_cost")).data).toEqual([{ symbol: "BBB", quantity: 2, average_cost: 20 }]);
    portfolioId = (await users.a.client.from("portfolios").select("id").single()).data!.id;
    proof(`${surface}: two candidate clicks and two rapid skip/include changes persist; only symbol issue removed, numeric issues preserved, Save gate and real BBB-only save`, true);
  }
  const before = (await admin.from("holdings").select("id,symbol,quantity,average_cost").eq("portfolio_id", portfolioId!)).data;
  const parsed = JSON.parse(savedAction!.payload);
  expect(parsed[0].portfolioId).toBe(portfolioId);
  parsed[0].holdings[0].quantity = 0;
  const postAction = (payload: string, path = `/portfolio/full?portfolioId=${portfolioId}`) => page.evaluate(async ({ payload, headers, path }) => {
    const response = await fetch(path, { method: "POST", headers, body: payload });
    return { status: response.status, url: response.url, text: await response.text() };
  }, { payload, headers: savedAction!.headers, path });
  expect((await postAction(JSON.stringify(parsed))).text).toContain("quantity must be a number greater than zero.");
  expect((await admin.from("holdings").select("id,symbol,quantity,average_cost").eq("portfolio_id", portfolioId!)).data).toEqual(before);
  await completeProfile(users.b);
  await createLocalSession(context, users.b);
  const denied = await postAction(savedAction!.payload);
  expect(denied.text).toContain("Portfolio not found or unauthorized.");
  expect((await admin.from("holdings").select("id,symbol,quantity,average_cost").eq("portfolio_id", portfolioId!)).data).toEqual(before);
  await context.clearCookies();
  const unauthorized = await postAction(savedAction!.payload);
  expect(new URL(unauthorized.url).pathname).toBe("/login");
  expect(new URL(unauthorized.url).searchParams.get("redirectTo")).toBe(`/portfolio/full?portfolioId=${portfolioId}`);
  expect((await admin.from("holdings").select("id,symbol,quantity,average_cost").eq("portfolio_id", portfolioId!)).data).toEqual(before);
  proof("captured real saveHoldings action rejects invalid numeric payload and cross-user ownership; anonymous protected POST redirects to login; exact prior holdings unchanged for each (anonymous action message remains isolated)", true);
});

test("E2E-00: themes and widths preserve real primary-link contrast and error-border utilities", async ({ page, proof }) => {
  httpFixtures("E2E-00-CSS");
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      await page.goto("/login");
      // Wait for the preference provider to reconcile its state before using its toggle.
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("pulsefolio-theme") === document.documentElement.dataset.theme)).toBe(true);
      const toggle = page.getByRole("button", { name: "Theme", exact: true });
      await expect.poll(async () => (await toggle.textContent())?.includes((await page.locator("html").getAttribute("data-theme")) === "dark" ? "Light mode" : "Dark mode")).toBe(true);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText("Illustrative scenario", { exact: true }).first()).toBeVisible();
      const colors = await page.getByRole("link", { name: "Get started", exact: true }).first().evaluate((link) => {
        const style = getComputedStyle(link);
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        const sample = (color: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data); };
        const fg = sample(style.color), bg = sample(style.backgroundColor);
        const luminance = (rgb: number[]) => rgb.slice(0, 3).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
        const a = luminance(fg), b = luminance(bg);
        return { color: style.color, background: style.backgroundColor, parentColor: getComputedStyle(link.parentElement!).color, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fg, bg };
      });
      expect(colors.color).not.toBe(colors.parentColor);
      expect(colors.bg[1]).toBeGreaterThan(colors.bg[0]);
      expect(colors.contrast).toBeGreaterThan(4.5);
      await page.goto("/auth/callback?code=e2e-invalid-local-code");
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.has("error"));
      const border = await page.locator('[class*="border-rose-500/25"]').evaluate((element) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!; ctx.fillStyle = style.borderTopColor; ctx.fillRect(0, 0, 1, 1);
        return { color: style.borderTopColor, width: style.borderTopWidth, rgba: Array.from(ctx.getImageData(0, 0, 1, 1).data) };
      });
      expect(border.width).toBe("1px");
      expect(border.rgba[0]).toBeGreaterThan(border.rgba[1]);
      expect(border.rgba[0]).toBeGreaterThan(border.rgba[2]);
      expect(border.rgba[3]).toBeGreaterThanOrEqual(62);
      expect(border.rgba[3]).toBeLessThanOrEqual(65);
      proof("computed real landing primary link and callback-error border after local Auth refusal", { width, theme, colors, border });
    }
  }
});

test("E2E-02: five exact CSV regression fixtures traverse the real preview and save actions", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  await createLocalSession(context, users.a);
  httpFixtures("E2E-02-exact-five", [...yahooSearchFixtures(["AAA", "BBB"]), ...yahooQuoteFixtures(["AAA", "BBB"])]);
  const holdings = async () => (await users.a.client.from("holdings").select("symbol,quantity,average_cost").eq("portfolio_id", portfolioId).order("symbol")).data;
  const variants = [
    { id: "DECL-0171", csv: "Symbol,Date,Quantity,Avg Cost\nAAA,2026-09-30,10,20", rows: [{ symbol: "AAA", quantity: 10, average_cost: 20 }] },
    { id: "DECL-0172", csv: "Date,Symbol,Action,Quantity,Purchase Price\n2026-01-02,AAA,Buy,10,20\n2026-02-02,AAA,Buy,10,30\n2026-03-02,AAA,Sell,5,40", rows: [{ symbol: "AAA", quantity: 15, average_cost: 25 }] },
    { id: "DECL-0173", csv: "Date,Symbol,Action,Quantity,Price\n2026-01-02,AAA,Dividend,10,20\n2026-01-03,BBB,Split,2,0", error: /2 row\(s\) without a recognizable buy\/sell side/ },
    { id: "DECL-0174", csv: "Symbol,Quantity,Avg Cost\n,5,10\nBBB,3,7\n\n", rows: [{ symbol: "BBB", quantity: 3, average_cost: 7 }] },
    { id: "DECL-0175", csv: "Symbol,Quantity,Avg Cost\n,5,10\n,3,7", error: /No holdings could be read from 2 row/ },
  ];
  for (const variant of variants) {
    const before = await holdings();
    await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: `${variant.id}.csv`, mimeType: "text/csv", buffer: Buffer.from(variant.csv) });
    if (variant.error) {
      await expect(page.getByText(variant.error)).toBeVisible();
      await expect(page.getByRole("button", { name: "Save holdings", exact: true })).toHaveCount(0);
      expect(await holdings()).toEqual(before);
      proof(`${variant.id}: exact CSV error visible, Save absent, durable prior holdings unchanged`, true);
    } else {
      await expect(page.getByText("1 confirmed, 0 unresolved, 0 skipped")).toBeVisible();
      const row = page.getByRole("row").filter({ has: page.getByText(variant.rows![0].symbol, { exact: true }) });
      await expect(row.getByRole("cell", { name: String(variant.rows![0].quantity), exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Replace all/ }).click();
      await page.getByRole("button", { name: "Save holdings", exact: true }).click();
      await expect.poll(holdings).toEqual(variant.rows);
      await expect(page.getByRole("button", { name: new RegExp(variant.rows![0].symbol) }).first().getByText(`${variant.rows![0].quantity.toFixed(2)}`, { exact: true })).toBeVisible();
      proof(`${variant.id}: exact CSV preview and real replace save preserve exact quantities/costs in DB and refreshed UI`, variant.rows);
    }
  }
});

test("E2E-00: public navigation, legal contact and page titles", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-00", ["premium", "ultimate"].map((plan) => ({
    origin: "https://api.stripe.com", method: "GET", path: `/v1/prices/price_e2e_${plan}`,
    body: { id: `price_e2e_${plan}`, object: "price", active: true, currency: "usd", unit_amount: 2000, recurring: { interval: "month" } },
  })));
  await page.goto("/");
  for (const href of ["/login", "/pricing", "/terms", "/privacy"]) await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByText("Email: ghaith.alali1996@gmail.com", { exact: true })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in - Pulsefolio");
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  for (const [path, title] of [["/feed", "Feed"], ["/portfolio", "Portfolio"], ["/portfolio/full", "Full portfolio"], ["/watchlist", "Watchlist"], ["/settings", "Settings"], ["/analysis", "Analysis"], ["/pricing", "Pricing"], ["/terms", "Terms of Service"]]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} - Pulsefolio`);
  }
  proof("public destinations, configured legal contact and nine real document titles", true);
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
  for (const authorization of [undefined, "Bearer e2e-invalid-jwt"]) {
    const headers: Record<string, string> = { apikey: anonKey };
    if (authorization) headers.authorization = authorization;
    expect([401, 403]).toContain((await fetch(`${gateway}/auth/v1/user`, { headers })).status);
    const read = await fetch(`${gateway}/rest/v1/holdings?select=id&portfolio_id=eq.${portfolioId}`, { headers });
    if (authorization) expect(read.status).toBe(401);
    else if (read.ok) expect(await read.json()).toEqual([]);
    else expect([401, 403]).toContain(read.status);
  }
  proof("real Auth rejects absent and invalid bearer; Data API exposes no A holding anonymously and rejects invalid JWT", true);
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
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("Fixture");
  await page.getByRole("textbox", { name: "Last name", exact: true }).fill("Alpha");
  await page.getByRole("textbox", { name: /Username @ Use 3-20/ }).fill(`alpha_${users.a.id.slice(0, 8)}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/portfolio");
  await page.reload();
  const profile = await users.a.client.from("user_profiles").select("first_name,last_name,accepted_terms_at").eq("user_id", users.a.id).single();
  expect(profile.error).toBeNull();
  expect(profile.data).toMatchObject({ first_name: "Fixture", last_name: "Alpha" });
  expect(profile.data?.accepted_terms_at).toBeTruthy();
  expect((await users.a.client.auth.refreshSession()).error).toBeNull();
  expect((await users.a.client.auth.getUser()).data.user?.id).toBe(users.a.id);
  await page.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.goto("/portfolio");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  proof("profile durable, Auth refresh and UI logout", true);
});

test("E2E-02: dated CSV preview and real replace import", async ({ page, context, users, proof }) => {
  await admin.from("user_profiles").upsert({ user_id: users.a.id, first_name: "Fixture", last_name: "Alpha", display_name: "Fixture Alpha", handle: `alpha_${users.a.id.slice(0, 8)}`, accepted_terms_at: new Date().toISOString() });
  const results = ["AAA", "BBB", "CCC", "DDD"].map((symbol) => ({
    origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v1/finance/search", query: { q: symbol },
    body: { quotes: [{ symbol, shortname: `Fixture ${symbol}`, exchange: "NMS", quoteType: "EQUITY", typeDisp: "equity", score: 1, index: "quotes", isYahooFinance: true }], news: [], nav: [], lists: [], explains: [], researchReports: [], screenerFieldResults: [], count: 1, totalTime: 1, timeTakenForQuotes: 1, timeTakenForNews: 1, timeTakenForAlgowatchlist: 1, timeTakenForPredefinedScreener: 1, timeTakenForCrunchbase: 1, timeTakenForNav: 1, timeTakenForResearchReports: 1, timeTakenForScreenerField: 1, timeTakenForCulturalAssets: 1, timeTakenForSearchLists: 1 },
  }));
  httpFixtures("E2E-02", [...results, ...yahooQuoteFixtures(["AAA", "BBB", "CCC", "DDD"])]);
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
  const portfolio = await users.a.client.from("portfolios").select("id").single();
  expect(portfolio.error).toBeNull();
  await page.goto(`/portfolio/full?portfolioId=${portfolio.data!.id}`);
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "mapped.csv", mimeType: "text/csv", buffer: Buffer.from("Code,Titres,Cout\nAAA,4,12\nCCC,5,9\n") });
  await expect(page.getByText("Map CSV columns", { exact: true })).toBeVisible();
  for (const [label, header] of [["Symbol / Ticker", "Code"], ["Quantity / Shares", "Titres"], ["Average Cost / Price", "Cout"]]) {
    await page.getByText(label, { exact: true }).locator("..").locator("..").getByRole("combobox").selectOption({ label: header });
  }
  await page.getByRole("button", { name: "Apply mapping" }).click();
  await expect(page.getByText("2 confirmed, 0 unresolved, 0 skipped")).toBeVisible();
  await page.getByRole("button", { name: /Replace all/ }).click();
  await page.getByRole("button", { name: "Save holdings", exact: true }).click();
  const holdings = async () => (await users.a.client.from("holdings").select("symbol,quantity,average_cost").eq("portfolio_id", portfolio.data!.id).order("symbol")).data;
  await expect.poll(holdings).toEqual([{ symbol: "AAA", quantity: 4, average_cost: 12 }, { symbol: "CCC", quantity: 5, average_cost: 9 }]);
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("4.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("$12.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /CCC/ }).first().getByText("5.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /BBB/ })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "merge.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Quantity,Average Cost\nAAA,2,14\nDDD,1,8\n") });
  await expect(page.getByText("2 confirmed, 0 unresolved, 0 skipped")).toBeVisible();
  await page.getByRole("button", { name: /Merge/ }).click();
  await page.getByRole("button", { name: "Save holdings", exact: true }).click();
  await expect.poll(holdings).toEqual([{ symbol: "AAA", quantity: 2, average_cost: 14 }, { symbol: "CCC", quantity: 5, average_cost: 9 }, { symbol: "DDD", quantity: 1, average_cost: 8 }]);
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("2.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("$14.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /DDD/ }).first().getByText("1.00", { exact: true })).toBeVisible();
  await page.reload();
  expect(await holdings()).toHaveLength(3);
  proof("manual column mapping and existing-portfolio replace/merge preserve exact current duplicate semantics", true);
});
