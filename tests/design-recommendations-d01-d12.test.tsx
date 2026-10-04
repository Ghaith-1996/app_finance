import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Approved design recommendations: D01 compact feed summary + sticky filters, D02 one score and
// one sentence per card, D06 focused Home, D09 benefit-led pricing, D12 plan-aware pricing.

vi.mock("@/components/app/refresh-prices-button", () => ({
  RefreshPricesButton: () => <button type="button">Refresh prices</button>,
}));

import { ActivePortfolioValueCard } from "@/components/app/active-portfolio-value-card";
import { NewsFeedCard } from "@/components/app/news-feed-card";
import { planCardState } from "@/lib/billing/pricing-view";
import { cardSummary } from "@/lib/feed/card-summary";
import { buildNextActions } from "@/lib/home/next-actions";
import type { NewsItem, PortfolioOverview } from "@/lib/types";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("D01 feed first screen", () => {
  it("replaces the three tall summary cards with one compact strip", () => {
    const page = read("app/feed/page.tsx");
    expect(page).toContain("compact");
    expect(page).not.toContain('md:grid-cols-3');
    expect(page).not.toContain("text-3xl");
  });

  it("keeps the filter bar reachable while scrolling on wide screens", () => {
    expect(read("components/app/feed-view.tsx")).toMatch(/lg:sticky lg:top-4/);
  });

  it("compact value card keeps value, day change, freshness and refresh", () => {
    const overview = {
      totalValue: 12345,
      dayChange: 1.5,
      lastSyncedAt: "5 minutes ago",
    } as PortfolioOverview;
    render(<ActivePortfolioValueCard portfolioId="p1" initialOverview={overview} compact />);
    expect(screen.getByText("Active portfolio value")).toBeTruthy();
    expect(screen.getByText(/today/)).toBeTruthy();
    expect(screen.getByText("Updated 5 minutes ago")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh prices" })).toBeTruthy();
  });
});

describe("D02 feed card", () => {
  const story = {
    id: "item-1",
    newsItemId: "news-1",
    headline: "Apple supplier raises guidance",
    source: "Reuters",
    publishedAt: "35 minutes ago",
    publishedMinutesAgo: 35,
    category: "earnings",
    stockTags: ["AAPL"],
    globalSummary: "Apple supplier raises guidance: commentary points to stronger iPhone demand.",
    displayEffect: "bullish",
    tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
    sourceType: "newsapi",
    sourceConfidence: "high",
    metadata: {},
    angle: "demand",
    relevanceScore: 94,
    holdings: ["AAPL"],
    impact: "High",
    matchReasonCodes: ["held_ticker_tag"],
  } as unknown as NewsItem;

  it("shows the score once and a summary that does not repeat the headline", () => {
    render(<NewsFeedCard story={story} mode="personal" />);
    expect(screen.getAllByText("94% match")).toHaveLength(1);
    expect(screen.getByText("Commentary points to stronger iPhone demand.")).toBeTruthy();
    expect(screen.queryByText("Score drivers")).toBeNull();
  });

  it("drops a summary that only restates the headline", () => {
    expect(cardSummary({ headline: "Fed holds rates", globalSummary: "Fed holds rates.", aiSummary: "" })).toBe("");
    expect(cardSummary({ headline: "Fed holds rates", globalSummary: "Markets were calm.", aiSummary: "" })).toBe(
      "Markets were calm.",
    );
  });
});

describe("D06 Home next actions", () => {
  const base = {
    recentAlerts: [],
    riskRadar: [],
    whatChanged: [],
    notifications: { emailDigestEnabled: true, smsDigestEnabled: false, hasPhoneNumber: false, smartAlertRuleCount: 2 },
  };

  it("puts high-severity alerts first, dedupes, and caps at three", () => {
    const actions = buildNextActions({
      ...base,
      recentAlerts: [
        { id: "a1", alertType: "price_move", severity: "medium", title: "MSFT moved 6%", message: "m", actionHref: "/alerts", createdAt: "" },
        { id: "a2", alertType: "critical_news", severity: "high", title: "AAPL news risk", message: "m", actionHref: "/feed?story=1", createdAt: "" },
      ],
      riskRadar: [
        { id: "r1", title: "AAPL news risk", detail: "d", href: "/feed?story=1", tone: "risk" },
        { id: "r2", title: "Concentration", detail: "d", href: "/portfolio/full", tone: "watch" },
        { id: "r3", title: "All good", detail: "d", href: "/x", tone: "good" },
      ],
    });
    expect(actions.map((action) => action.title)).toEqual(["AAPL news risk", "MSFT moved 6%", "Concentration"]);
  });

  it("offers setup steps only when nothing is pending", () => {
    const actions = buildNextActions({
      ...base,
      notifications: { emailDigestEnabled: false, smsDigestEnabled: false, hasPhoneNumber: false, smartAlertRuleCount: 0 },
    });
    expect(actions.map((action) => action.id)).toEqual(["setup-digest", "setup-alerts"]);
    expect(buildNextActions(base)).toEqual([]);
  });

  it("community has its own protected route and Home links to it", () => {
    expect(read("app/home/page.tsx")).toContain('href="/community"');
    expect(read("app/home/page.tsx")).not.toContain("HomeFeedClient");
    expect(read("app/community/page.tsx")).toContain("HomeFeedClient");
    expect(read("middleware.ts")).toContain('"/community"');
    expect(read("lib/security/redirect.ts")).toContain('"/community"');
  });
});

describe("D09 pricing copy", () => {
  it("describes user benefits, not which vendor serves each plan", () => {
    const page = read("app/pricing/page.tsx");
    expect(page).not.toMatch(/Mistral|Azure|OpenRouter|routed to/);
    expect(page).toContain("100 AI requests per day");
    expect(page).toContain("5,000 AI requests per month");
    expect(page).toContain("20,000 AI requests per month");
    expect(page).toContain("LEGAL_REFUND_NOTICE");
    expect(page).toContain("mt-auto");
  });
});

describe("D12 plan-aware pricing", () => {
  const summary = (overrides: Partial<Parameters<typeof planCardState>[1] & object>) => ({
    planKey: "free" as const,
    hasPaidAccess: false,
    hasAdminModelAccess: false,
    allowedModelTiers: ["free" as const],
    ...overrides,
  });

  it("signed-out viewers see the free baseline and checkout for paid plans", () => {
    expect(planCardState("free", null)).toEqual({ kind: "baseline" });
    expect(planCardState("premium", null)).toEqual({ kind: "checkout" });
  });

  it("free users are offered checkout", () => {
    expect(planCardState("free", summary({}))).toEqual({ kind: "current" });
    expect(planCardState("ultimate", summary({}))).toEqual({ kind: "checkout" });
  });

  it("account-level access is acknowledged instead of sold", () => {
    const admin = summary({ hasAdminModelAccess: true, allowedModelTiers: ["free", "premium", "ultimate"] });
    expect(planCardState("premium", admin)).toEqual({ kind: "included", reason: "account" });
    expect(planCardState("ultimate", admin)).toEqual({ kind: "included", reason: "account" });
  });

  it("paid users see lower plans as included and higher plans via the billing portal", () => {
    const ultimate = summary({ planKey: "ultimate", hasPaidAccess: true, allowedModelTiers: ["free", "premium", "ultimate"] });
    expect(planCardState("ultimate", ultimate)).toEqual({ kind: "current" });
    expect(planCardState("premium", ultimate)).toEqual({ kind: "included", reason: "plan" });
    expect(planCardState("free", ultimate)).toEqual({ kind: "included", reason: "plan" });

    const premium = summary({ planKey: "premium", hasPaidAccess: true, allowedModelTiers: ["free", "premium"] });
    expect(planCardState("ultimate", premium)).toEqual({ kind: "portal" });
  });
});
