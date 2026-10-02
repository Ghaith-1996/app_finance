import { describe, expect, it } from "vitest";

import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import { formatAppDateTime, formatRelativeTime } from "@/lib/time/format";
import type { Holding } from "@/lib/types";

// Audit F15: one timestamp policy across surfaces.

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("formatRelativeTime", () => {
  it("only says 'Just now' for under a minute", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("Just now");
    expect(formatRelativeTime(ago(1), NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(ago(59), NOW)).toBe("59 minutes ago");
  });

  it("labels hour and day boundaries consistently", () => {
    expect(formatRelativeTime(ago(60), NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(ago(150), NOW)).toBe("2 hours ago");
    expect(formatRelativeTime(ago(24 * 60 - 1), NOW)).toBe("23 hours ago");
    expect(formatRelativeTime(ago(24 * 60), NOW)).toBe("1 day ago");
    expect(formatRelativeTime(ago(3 * 24 * 60), NOW)).toBe("3 days ago");
  });

  it("never renders negative ages for future timestamps (clock skew)", () => {
    expect(formatRelativeTime(ago(-5), NOW)).toBe("Just now");
  });

  it("falls back instead of throwing on missing or invalid input", () => {
    expect(formatRelativeTime(null, NOW)).toBe("—");
    expect(formatRelativeTime("not-a-date", NOW, "Unknown time")).toBe("Unknown time");
  });
});

describe("formatAppDateTime", () => {
  it("renders in the product time zone with a zone label, independent of the host zone", () => {
    // 16:30 UTC in October is 12:30 PM EDT.
    expect(formatAppDateTime("2026-10-02T16:30:00.000Z")).toBe("Oct 2, 12:30 PM EDT");
    // Winter uses EST.
    expect(formatAppDateTime("2026-01-15T16:30:00.000Z")).toBe("Jan 15, 11:30 AM EST");
  });

  it("falls back on missing or invalid input", () => {
    expect(formatAppDateTime(undefined)).toBe("—");
    expect(formatAppDateTime("garbage", "Recent")).toBe("Recent");
  });
});

describe("portfolio health freshness labels", () => {
  const holding = {
    id: "h1",
    symbol: "AAPL",
    company: "Apple",
    sector: "Technology",
    market: "US",
    source: "Manual",
    price: 100,
    dailyChange: 0,
    allocation: 100,
    thesis: "",
    quantity: 10,
    averageCost: 90,
    costBasis: 900,
    currentPrice: 100,
    currentValue: 1000,
    unrealizedGainAmount: 100,
    unrealizedGainPercent: 11.1,
    quoteCurrency: "USD",
    quoteAsOf: ago(120),
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  } as Holding;

  it("does not call a 45-minute-old analysis 'Just now' and does not claim quotes are 'Fresh'", () => {
    const result = calculatePortfolioHealth({ holdings: [holding], latestAnalysisAt: ago(45), now: NOW });
    const byId = Object.fromEntries(result.factors.map((factor) => [factor.id, factor.value]));
    expect(byId.analysis_freshness).toBe("45 minutes ago");
    expect(byId.quote_freshness).toBe("Within 24h");
  });
});
