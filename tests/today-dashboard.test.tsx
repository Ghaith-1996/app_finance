import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TodayDashboard } from "@/components/app/today-dashboard";
import type { HomeDashboardData } from "@/lib/server/page-loaders";

const dashboardData: HomeDashboardData = {
  portfolioId: "portfolio-1",
  portfolioName: "Core Portfolio",
  overview: {
    totalValue: 125000,
    dayChange: 1.25,
    monthlyChange: 0,
    lastSyncedAt: "Just now",
    lastAnalyzedAt: "1 hour ago",
    coverage: "8 high-signal stories",
    primaryGoal: "Stay balanced",
  },
  health: {
    score: 82,
    label: "Balanced",
    summary: "A few items deserve review.",
    factors: [
      {
        id: "position_concentration",
        label: "Top position",
        value: "AAPL 24%",
        detail: "AAPL is the largest tracked position.",
        tone: "good",
      },
    ],
    risks: [
      {
        title: "AI analysis",
        detail: "Analysis is older than one trading day.",
        tone: "watch",
        href: "/analysis",
      },
    ],
    opportunities: [
      {
        title: "NVDA catalyst",
        detail: "Cloud demand remains resilient.",
        tone: "good",
        href: "/feed",
      },
    ],
  },
  insights: [
    {
      title: "Macro watch",
      value: "Rates",
      detail: "Rate expectations are driving valuation sensitivity.",
    },
  ],
  topStories: [
    {
      headline: "Cloud demand supports software names",
      source: "MarketWire",
      publishedAt: "2026-05-31T13:00:00.000Z",
      category: "technology",
      relevanceScore: 88,
      whyItMatters: "Matches AAPL and MSFT exposure.",
      holdings: ["AAPL", "MSFT"],
      sectors: ["Technology"],
      aiSummary: "Demand remains resilient.",
      matchReasonCodes: ["held_ticker_tag"],
    },
  ],
  earnings: [
    {
      symbol: "AAPL",
      title: "Apple",
      reportDate: "2026-05-01",
      source: "company",
      href: "https://investor.example.com/aapl",
    },
  ],
  latestDigest: {
    id: "digest-1",
    digestDate: "2026-05-31",
    summaryLine: "Bullish leaders: AAPL. Bearish leaders: none.",
    storyCount: 3,
    bullishSymbols: ["AAPL"],
    bearishSymbols: [],
  },
  notifications: {
    emailDigestEnabled: true,
    smsDigestEnabled: false,
    hasPhoneNumber: false,
    smartAlertRuleCount: 3,
  },
  recentAlerts: [
    {
      id: "alert-1",
      alertType: "critical_news",
      severity: "high",
      title: "AAPL news risk",
      message: "Regulatory pressure is increasing.",
      actionHref: "/feed?story=news-1",
      createdAt: "2026-05-31T14:00:00.000Z",
    },
  ],
  whatChanged: [
    {
      id: "high-alert",
      title: "High-priority alert generated",
      detail: "AAPL news risk",
      href: "/alerts",
      tone: "risk",
    },
  ],
  activity: [
    {
      id: "analysis-run",
      title: "Analysis completed",
      detail: "Latest portfolio scoring run is ready.",
      href: "/analysis",
      occurredAt: "2026-05-31T13:30:00.000Z",
      type: "analysis",
    },
  ],
  timeline: [
    {
      id: "thesis-1",
      title: "AAPL thesis updated",
      detail: "Services growth can support margins.",
      href: "/portfolio/full",
      occurredAt: "2026-05-31T14:15:00.000Z",
      type: "thesis",
    },
  ],
  riskRadar: [
    {
      id: "risk-alert-1",
      title: "AAPL news risk",
      detail: "Regulatory pressure is increasing.",
      href: "/alerts",
      tone: "risk",
    },
  ],
  freshness: [
    {
      id: "prices",
      label: "Prices",
      value: "Just now",
      detail: "Holding quotes and portfolio value.",
      href: "/portfolio/full",
      tone: "good",
    },
    {
      id: "news",
      label: "News",
      value: "10 minutes ago",
      detail: "Latest article in the shared market pool.",
      href: "/feed",
      tone: "good",
    },
  ],
  marketStoryCount24h: 120,
  matchedStoryCount24h: 8,
};

describe("TodayDashboard", () => {
  it("renders portfolio health, alert readiness, and current signals", () => {
    render(<TodayDashboard data={dashboardData} />);

    expect(screen.getByText("Portfolio value")).toBeInTheDocument();
    expect(screen.getByText("$125,000")).toBeInTheDocument();
    expect(screen.getByText("Health Score")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Smart alerts")).toBeInTheDocument();
    expect(screen.getByText("3 armed")).toBeInTheDocument();
    expect(screen.getByText("What changed today")).toBeInTheDocument();
    expect(screen.getByText("Portfolio changelog")).toBeInTheDocument();
    expect(screen.getByText("Portfolio timeline")).toBeInTheDocument();
    expect(screen.getByText("Data freshness")).toBeInTheDocument();
    expect(screen.getByText("Risk radar")).toBeInTheDocument();
    expect(screen.getAllByText("AAPL news risk").length).toBeGreaterThan(0);
    expect(screen.getByText("Analysis completed")).toBeInTheDocument();
    expect(screen.getByText("Cloud demand supports software names")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
  });

  it("renders onboarding guidance without a portfolio", () => {
    render(
      <TodayDashboard
        data={{
          ...dashboardData,
          portfolioId: null,
          portfolioName: null,
          overview: {
            ...dashboardData.overview,
            totalValue: 0,
          },
          topStories: [],
          earnings: [],
          marketStoryCount24h: 42,
          matchedStoryCount24h: 0,
        }}
      />,
    );

    expect(screen.getByText("Build your first portfolio brief")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start onboarding/i })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });
});
