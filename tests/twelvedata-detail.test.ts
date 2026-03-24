import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockCached = vi.fn();
vi.mock("@/lib/services/cache", () => ({
  cached: (...args: unknown[]) => mockCached(...args),
}));

import { getWatchlistDetail } from "@/lib/services/twelvedata";

function setupEnv() {
  process.env.TWELVE_DATA_API_KEY = "test-key";
}

function mockAllEndpoints(overrides: Record<string, unknown> = {}) {
  mockCached.mockImplementation(async (key: string, fn: () => Promise<unknown>) => {
    if (key.startsWith("td:quote:")) return overrides.quote ?? { close: "150.00", change: "2.50", percent_change: "1.69", name: "Apple Inc", exchange: "NASDAQ", currency: "USD", open: "148.00", high: "151.00", low: "147.50", previous_close: "147.50", volume: "80000000", average_volume: "70000000", market_cap: 2_500_000_000_000, is_market_open: true, fifty_two_week: { low: "120.00", high: "180.00" } };
    if (key.startsWith("td:profile:")) return overrides.profile ?? { name: "Apple Inc", exchange: "NASDAQ", sector: "Technology", industry: "Consumer Electronics", country: "United States", website: "https://apple.com", CEO: "Tim Cook", employees: 160000 };
    if (key.startsWith("td:ts:")) return overrides.ts ?? { values: [{ datetime: "2025-01-01", close: "148" }, { datetime: "2025-01-02", close: "150" }] };
    if (key.startsWith("td:stats:")) return overrides.stats ?? { statistics: { valuations_metrics: { trailing_pe: 28.5, forward_pe: 25.0 }, financials: { diluted_eps_ttm: 6.50, profit_margin: 0.25, quarterly_revenue_growth: 0.08 }, stock_price_summary: { beta: 1.2 }, dividends_and_splits: { forward_annual_dividend_yield: 0.005 } } };
    if (key.startsWith("td:earnings:")) return overrides.earnings ?? [{ date: "2025-01-15", eps_estimate: 1.50, eps_actual: 1.60, surprise_prc: 6.67 }, { date: "2025-04-15", eps_estimate: 1.55, eps_actual: 1.58, surprise_prc: 1.94 }];
    if (key.startsWith("td:income:")) return overrides.income ?? [{ fiscal_date: "2025-01-15", quarter: 1, sales: 120_000_000_000, net_income: 30_000_000_000 }];
    if (key.startsWith("td:balance:")) return overrides.balance ?? [{ fiscal_date: "2025-01-15", quarter: 1, total_debt: 100_000_000_000, cash_and_short_term_investments: 60_000_000_000 }];
    if (key.startsWith("td:cashflow:")) return overrides.cashflow ?? [{ fiscal_date: "2025-01-15", quarter: 1, free_cash_flow: 25_000_000_000 }];
    return fn();
  });
}

describe("getWatchlistDetail", () => {
  beforeEach(() => {
    mockCached.mockReset();
  });

  it("returns error when API key is missing", async () => {
    delete process.env.TWELVE_DATA_API_KEY;
    const result = await getWatchlistDetail("AAPL");
    expect(result.error).toContain("not configured");
  });

  it("returns full sectioned data for a successful symbol", async () => {
    setupEnv();
    mockAllEndpoints();

    const result = await getWatchlistDetail("AAPL");

    expect(result.error).toBeNull();
    expect(result.summary.company).toBe("Apple Inc");
    expect(result.summary.price).toBe(150);
    expect(result.summary.changePercent).toBe(1.69);
    expect(result.summary.isMarketOpen).toBe(true);

    expect(result.chart).toHaveLength(2);
    expect(result.chart[0].close).toBe(148);

    expect(result.stats.pe).toBe(28.5);
    expect(result.stats.eps).toBe(6.5);
    expect(result.stats.beta).toBe(1.2);
    expect(result.stats.marketCap).toBe(2_500_000_000_000);

    expect(result.profile.sector).toBe("Technology");
    expect(result.profile.ceo).toBe("Tim Cook");
    expect(result.profile.employees).toBe(160000);

    expect(result.earnings).toHaveLength(2);
    expect(result.earnings[0].epsActual).toBe(1.6);

    expect(result.financials).toHaveLength(1);
    expect(result.financials[0].revenue).toBe(120_000_000_000);
    expect(result.financials[0].totalCash).toBe(60_000_000_000);
    expect(result.financials[0].freeCashFlow).toBe(25_000_000_000);

    expect(result.capabilities.hasStats).toBe(true);
    expect(result.capabilities.hasEarnings).toBe(true);
    expect(result.capabilities.hasFinancials).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns partial data when some endpoints fail", async () => {
    setupEnv();
    let callCount = 0;
    mockCached.mockImplementation(async (key: string) => {
      callCount++;
      if (key.startsWith("td:quote:")) return { close: "100", name: "Test", currency: "USD" };
      if (key.startsWith("td:stats:") || key.startsWith("td:earnings:") || key.startsWith("td:income:") || key.startsWith("td:balance:") || key.startsWith("td:cashflow:")) {
        throw new Error("TwelveData HTTP 403");
      }
      if (key.startsWith("td:profile:")) return { name: "Test Corp" };
      if (key.startsWith("td:ts:")) return { values: [] };
      return null;
    });

    const result = await getWatchlistDetail("TEST");

    expect(result.error).toBeNull();
    expect(result.summary.price).toBe(100);
    expect(result.capabilities.hasStats).toBe(false);
    expect(result.capabilities.hasEarnings).toBe(false);
    expect(result.capabilities.hasFinancials).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === "plan_not_supported")).toBe(true);
  });

  it("returns error when all core endpoints fail", async () => {
    setupEnv();
    mockCached.mockRejectedValue(new Error("TwelveData HTTP 500"));

    const result = await getWatchlistDetail("BAD");

    expect(result.error).toBe("Could not load details for this symbol.");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles missing earnings and financials gracefully", async () => {
    setupEnv();
    mockAllEndpoints({ earnings: [], income: [], balance: [], cashflow: [] });

    const result = await getWatchlistDetail("AAPL");

    expect(result.error).toBeNull();
    expect(result.earnings).toHaveLength(0);
    expect(result.financials).toHaveLength(0);
    expect(result.capabilities.hasEarnings).toBe(false);
    expect(result.capabilities.hasFinancials).toBe(false);
  });
});
