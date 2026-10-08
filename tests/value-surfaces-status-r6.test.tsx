import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Review R6: Home and Analysis follow the canonical valuation status. A CAD position without an
// FX rate is "unavailable" (not "$0 / +0.00%"), and a partially valued portfolio says so.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/portfolio", () => ({ refreshPortfolioPricingSnapshot: vi.fn() }));

import { PortfolioSnapshotPanel } from "@/components/app/portfolio-snapshot-panel";
import { TodayDashboard } from "@/components/app/today-dashboard";
import type { HomeDashboardData } from "@/lib/server/page-loaders";
import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import { summarizeValuation, valuePortfolio, type ValuationHoldingInput } from "@/lib/services/valuation";
import type { PortfolioOverview } from "@/lib/types";

const asOf = "2026-10-03T15:00:00.000Z";
const cadWithoutFx: ValuationHoldingInput = {
  symbol: "SHOP.TO",
  quantity: 10,
  price: 100,
  previousClose: 99,
  averageCost: 80,
  currency: "CAD",
  fxRateToBase: null,
  quoteAsOf: asOf,
};
const usdPriced: ValuationHoldingInput = {
  symbol: "AAPL",
  quantity: 10,
  price: 100,
  previousClose: 98,
  averageCost: 80,
  currency: "USD",
  quoteAsOf: asOf,
};

/** Same steps as buildPortfolioOverview in lib/server/page-loaders.ts. */
function overviewFor(inputs: ValuationHoldingInput[]): PortfolioOverview {
  const valuation = valuePortfolio(inputs, { now: new Date(asOf) });
  return {
    totalValue: Math.round(valuation.totalValue),
    dayChange: Math.round((valuation.dayChangePercent ?? 0) * 100) / 100,
    valuation: summarizeValuation(valuation),
    monthlyChange: 0,
    lastSyncedAt: "1m ago",
    lastAnalyzedAt: "Never",
    coverage: "0 stories",
    primaryGoal: "",
  };
}

function homeData(overview: PortfolioOverview): HomeDashboardData {
  return {
    portfolioId: "p1",
    portfolioName: "Main",
    overview,
    health: calculatePortfolioHealth({ holdings: [] }),
    insights: [],
    topStories: [],
    earnings: [],
    latestDigest: null,
    notifications: { emailDigestEnabled: false, smsDigestEnabled: false, hasPhoneNumber: false, smartAlertRuleCount: 0 },
    recentAlerts: [],
    whatChanged: [],
    activity: [],
    timeline: [],
    riskRadar: [],
    freshness: [],
    marketStoryCount24h: 0,
    matchedStoryCount24h: 0,
  };
}

describe("Home value follows the valuation status", () => {
  it("unavailable valuation shows unknown, not $0 / 0.00%", () => {
    const overview = overviewFor([cadWithoutFx]);
    expect(overview.valuation?.status).toBe("unavailable");

    render(<TodayDashboard data={homeData(overview)} />);

    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.queryByText(/^\+?0\.00%$/)).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/No USD exchange rate for CAD/)).toBeTruthy();
  });

  it("partial valuation says which positions are excluded", () => {
    render(<TodayDashboard data={homeData(overviewFor([usdPriced, cadWithoutFx]))} />);

    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByText(/Excludes 1 position .*SHOP\.TO/)).toBeTruthy();
  });
});

describe("Analysis snapshot panel shows its coverage notes", () => {
  it("partial valuation note is rendered", () => {
    render(<PortfolioSnapshotPanel initialOverview={overviewFor([usdPriced, cadWithoutFx])} portfolioId={null} />);

    expect(screen.getByText(/Excludes 1 position .*SHOP\.TO/)).toBeTruthy();
    expect(screen.getByText(/No USD exchange rate for CAD/)).toBeTruthy();
  });
});
