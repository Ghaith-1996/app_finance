import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, expect, admin, completeProfile, createLocalSession, seedPortfolio, httpFixtures, yahooQuoteFixtures } from "./fixtures";

// Browser plugin not available: run the compiled application in the repository's Chromium stack.
// Auth, PostgREST, RLS, CSS, media queries and IntersectionObserver are real. Analysis statuses
// are seeded fixtures; realtime delivery is outside this presentation test (runner disables it).
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }, info) => {
  httpFixtures("frontend-polish");
  const errors: string[] = [];
  browserErrors.set(page, errors);
  const redact = (text: string) => text.replace(/(?:https?|wss?):\/\/[^\s'"<>]+/g, "[url]");
  page.on("pageerror", (error) => errors.push(redact(error.message)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/authenticated analysis|feed deep links/.test(info.title) && (text.includes("/realtime/v1") || message.location().url.includes("/realtime/v1"))) return;
    errors.push(redact(text));
  });
});
test.afterEach(async ({ page }) => {
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(browserErrors.get(page)).toEqual([]);
});

async function revealCases(page: Page) {
  const section = page.locator("#use-cases");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".uc-animate-fade-up")).toHaveCount(1);
  return section;
}

test.describe("landing without scripts", () => {
  test.use({ javaScriptEnabled: false });
  test("E2E-00: landing content and native anchor navigation remain visible without JavaScript", async ({ page, proof }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.locator('header a[href="#use-cases"]').click();
    await expect(page).toHaveURL(/#use-cases$/);
    const section = page.locator("#use-cases");
    await expect(section.getByRole("heading", { name: "See how it works in your daily investing routine" })).toBeVisible();
    expect(await section.locator("h2:visible, button[aria-pressed]:visible").evaluateAll((elements) => elements.every((element) => {
      for (let ancestor: Element | null = element; ancestor && ancestor.id !== "use-cases"; ancestor = ancestor.parentElement) {
        if (getComputedStyle(ancestor).opacity !== "1") return false;
      }
      return true;
    }))).toBe(true);
    proof("server-rendered content and native anchor navigation with scripting disabled; no IntersectionObserver stub", true);
  });
});

for (const width of [1440, 390]) {
  test(`E2E-00: reduced motion reveals every landing card immediately at ${width}px`, async ({ page, proof }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page).toHaveTitle(/Pulsefolio/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const mesh = page.getByTestId("hero-mesh");
    await expect(mesh).toHaveAttribute("aria-hidden", "true");
    await expect(mesh).toBeEmpty();
    expect(await mesh.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");
    await page.screenshot({ path: `/proof/hero-reduced-motion-${width}.png` });
    const section = await revealCases(page);
    const animated = section.locator('[class*="uc-animate-"]:visible');
    expect(await animated.count()).toBeGreaterThan(3);
    expect(await animated.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationDelay))).toEqual(Array(await animated.count()).fill("0s"));
    expect(await animated.evaluateAll((elements) => elements.every((element) => {
      const style = getComputedStyle(element);
      return parseFloat(style.animationDuration) <= 0.00001 && style.animationIterationCount === "1" && parseFloat(style.transitionDuration) <= 0.00001;
    }))).toBe(true);
    await expect.poll(() => animated.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).opacity === "1"))).toBe(true);
    await page.screenshot({ path: `/proof/landing-reduced-motion-${width}.png` });
    const cards = section.locator("button[aria-pressed]:visible");
    if (width >= 1024) {
      await cards.nth(2).hover();
      await page.waitForTimeout(4500); // Observe a whole real auto-advance interval, without fake timers.
      await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
      await cards.nth(2).click();
      await expect(cards.nth(2)).toHaveAttribute("aria-pressed", "true");
      const chat = section.getByText("How does this affect my MSFT position specifically?", { exact: true }).filter({ visible: true });
      await expect(chat).toBeVisible();
      expect(await chat.evaluate((element) => getComputedStyle(element).animationDelay)).toBe("0s");
      await expect.poll(() => chat.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    }
    // A spinning loading indicator remains animated while decorative transitions collapse.
    const spinner = await page.evaluate(() => {
      const element = document.createElement("div");
      element.className = "animate-spin";
      document.body.append(element);
      const style = getComputedStyle(element);
      const result = { name: style.animationName, duration: parseFloat(style.animationDuration) };
      element.remove();
      return result;
    });
    expect(spinner.name).toBe("spin");
    expect(spinner.duration).toBeGreaterThan(0.1);
    proof("real reduced-motion media query, visible reveal contents, zero delayed chat bubbles, static decorative mesh and animated loading spinner", { width });
  });
}

test("E2E-00: real use-case timers stop after pointer selection and keyboard focus", async ({ page, proof }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const mesh = page.getByTestId("hero-mesh");
  expect(await mesh.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("hero-mesh-drift");
  const dark = await mesh.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  await page.getByRole("button", { name: /theme/i }).click();
  await expect.poll(() => mesh.evaluate((element) => getComputedStyle(element, "::before").backgroundImage)).not.toBe(dark);
  await page.setViewportSize({ width: 800, height: 900 });
  expect(await mesh.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");
  await page.setViewportSize({ width: 1440, height: 900 });
  const section = await revealCases(page);
  const cards = section.locator("button[aria-pressed]:visible");
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true", { timeout: 6500 });
  await cards.nth(2).hover();
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await cards.nth(0).click();
  await page.waitForTimeout(4500);
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const reloaded = await revealCases(page);
  await reloaded.locator("button[aria-pressed]:visible").nth(0).focus();
  await page.waitForTimeout(4500);
  await expect(reloaded.locator("button[aria-pressed]:visible").nth(0)).toHaveAttribute("aria-pressed", "true");
  proof("real observer/timers: advance after entering viewport; hover unchanged; pointer choice and keyboard focus stop cycling; mesh responds to theme, width and OS preference", true);
});

test("E2E-05: reduced-motion feed deep links and pagination perform native instant scrolling", async ({ page, context, users, proof }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const observed = window as typeof window & { __frontendScroll: Array<{ kind: string; behavior: string | null }> };
    observed.__frontendScroll = [];
    const scrollTo = window.scrollTo;
    window.scrollTo = ((...args: unknown[]) => {
      const options = args[0] as ScrollToOptions | undefined;
      observed.__frontendScroll.push({ kind: "window", behavior: typeof options === "object" ? options.behavior ?? null : null });
      Reflect.apply(scrollTo, window, args);
    }) as typeof window.scrollTo;
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      observed.__frontendScroll.push({ kind: "element", behavior: typeof options === "object" ? options.behavior ?? null : null });
      scrollIntoView.call(this, options);
    };
  });
  // These wrappers observe options and always delegate to the original browser scrolling APIs.
  httpFixtures("frontend-feed-motion", yahooQuoteFixtures(["AAA"]));
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const runId = randomUUID();
  expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: randomUUID(), headline: `Fixture scroll story ${index}`, source: "Fixture", published_at: new Date(Date.now() - index * 60_000).toISOString(), category: "other", stock_tags: ["AAA"], global_summary: "Fixture article summary." }));
  try {
    expect((await admin.from("news_items").insert(rows)).error).toBeNull();
    expect((await admin.from("feed_items").insert(rows.map((row) => ({ analysis_run_id: runId, news_item_id: row.id, portfolio_id: portfolioId, relevance_score: 100, holdings: ["AAA"], ai_summary: row.global_summary })))).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto(`/feed?portfolioId=${portfolioId}&story=${rows[20].id}`);
    const dialog = page.getByRole("dialog", { name: "Article details" });
    await expect(dialog.getByText(rows[20].headline, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /close/i }).first().click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of 2 · Showing 1 of 101 articles", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const calls = await page.evaluate(() => (window as typeof window & { __frontendScroll: Array<{ kind: string; behavior: string | null }> }).__frontendScroll);
    expect(calls).toContainEqual({ kind: "element", behavior: "auto" });
    expect(calls).toContainEqual({ kind: "window", behavior: "auto" });
    // Inject only the legacy API absence, then exercise the same real UI/native scroll.
    await page.evaluate(() => { Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined }); });
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.getByText("Page 1 of 2 · Showing 100 of 101 articles", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => (window as typeof window & { __frontendScroll: Array<{ kind: string; behavior: string | null }> }).__frontendScroll)).toContainEqual({ kind: "window", behavior: "smooth" });
    proof("real owned feed, article deep link and pagination delegate instant options to native browser scrolling under reduced motion", true);
    proof("injected missing-matchMedia API: hydrated feed still paginates using native smooth-scroll fallback without an exception", true);
  } finally { await admin.from("news_items").delete().in("id", rows.map((row) => row.id)); }
});

test("E2E-01: authenticated analysis renders durable idle, running and terminal states with owner isolation", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  await createLocalSession(context, users.a);
  await page.goto(`/analysis?portfolioId=${portfolioId}`);
  await expect(page).toHaveTitle("Analysis - Pulsefolio");
  await expect(page.getByRole("heading", { name: "Waiting for next update", exact: true })).toBeVisible();
  const labels = ["Portfolio received", "Processing holdings", "Mapping the news graph", "Generating insights", "Preparing the feed"];
  async function steps(expected: string[]) {
    for (const [index, label] of labels.entries()) {
      await expect(page.getByText(label, { exact: true }).filter({ visible: true }).locator("../..").locator("span")).toHaveText(expected[index]);
    }
  }
  await steps(["upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
  const id = randomUUID();
  expect((await admin.from("analysis_runs").insert({ id, portfolio_id: portfolioId, status: "queued", progress: 0 })).error).toBeNull();
  for (const scenario of [
    { status: "queued", progress: 0, heading: "Building portfolio-aware explanations", badge: "Queued", steps: ["current", "upcoming", "upcoming", "upcoming", "upcoming"] },
    { status: "mapping_news", progress: 50, heading: "Building portfolio-aware explanations", badge: "Mapping news", steps: ["complete", "complete", "current", "upcoming", "upcoming"] },
    { status: "complete", progress: 100, heading: "Analysis complete", badge: "Complete", steps: ["complete", "complete", "complete", "complete", "complete"] },
    { status: "degraded", progress: 100, heading: "Analysis completed with limited confidence", badge: "Limited confidence", steps: ["complete", "complete", "complete", "complete", "complete"] },
    { status: "failed", progress: 0, heading: "Analysis failed", badge: "Failed", steps: ["stopped", "stopped", "stopped", "stopped", "stopped"] },
  ]) {
    expect((await admin.from("analysis_runs").update({ status: scenario.status, progress: scenario.progress, completed_at: scenario.progress === 100 ? new Date().toISOString() : null }).eq("id", id)).error).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
    await expect(page.getByText(scenario.badge, { exact: true })).toBeVisible();
    await steps(scenario.steps);
    await expect(page.getByText("New stories are checked every 20 minutes; analysis re-runs only when there are new ones", { exact: true })).toBeVisible();
  }
  await createLocalSession(context, users.b);
  expect((await context.request.get(`/api/analysis/run?portfolioId=${portfolioId}`)).status()).toBe(404);
  await completeProfile(users.b);
  await page.goto(`/analysis?portfolioId=${portfolioId}`);
  await expect(page.getByRole("heading", { name: "Create a portfolio first", exact: true })).toBeVisible();
  proof("real Auth sessions, owned API reads and persisted status fixtures render five correct stage labels; cross-user API read refused. Realtime delivery and AI generation are not simulated as successful runs", true);
});
