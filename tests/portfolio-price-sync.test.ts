import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PortfolioRow = {
  id: string;
  user_id: string;
  last_synced_at: string | null;
  sync_status?: string;
};

type HoldingRow = {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: number;
  quote_as_of: string | null;
  price?: number;
  current_price?: number;
  daily_change?: number;
  quote_currency?: string;
  allocation?: number;
  previous_close?: number | null;
  fx_rate_to_usd?: number | null;
  fx_as_of?: string | null;
};

type EarningsReportRow = {
  symbol: string;
  is_active?: boolean;
};

const mocked = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getQuotes: vi.fn(),
  updateHolding: vi.fn(),
  computePortfolioOverview: vi.fn(),
  state: {
    authUserId: null as string | null,
    portfolios: [] as PortfolioRow[],
    holdings: [] as HoldingRow[],
    ticker_earnings_reports: [] as EarningsReportRow[],
  },
  failHoldingUpdateIds: new Set<string>(),
}));

function makeBuilder(table: "portfolios" | "holdings" | "ticker_earnings_reports") {
  const filters = new Map<string, unknown>();
  let mode: "select" | "update" = "select";
  let payload: Record<string, unknown> | null = null;

  const matches = (row: Record<string, unknown>) => {
    for (const [key, value] of filters.entries()) {
      if (Array.isArray(value)) {
        if (!value.includes(row[key])) return false;
        continue;
      }
      if (row[key] !== value) return false;
    }
    return true;
  };

  const runSelect = () => {
    const rows =
      table === "portfolios"
        ? mocked.state.portfolios.filter((row) =>
            matches(row as unknown as Record<string, unknown>),
          )
        : table === "holdings"
          ? mocked.state.holdings.filter((row) =>
            matches(row as unknown as Record<string, unknown>),
          )
          : mocked.state.ticker_earnings_reports.filter((row) =>
            matches(row as unknown as Record<string, unknown>),
          );

    return { data: rows, error: null as null | { message: string } };
  };

  const runUpdate = () => {
    const rows =
      table === "portfolios"
        ? mocked.state.portfolios
        : table === "holdings"
          ? mocked.state.holdings
          : mocked.state.ticker_earnings_reports;
    if (table === "holdings") {
      const holdingId = filters.get("id");
      if (
        typeof holdingId === "string" &&
        mocked.failHoldingUpdateIds.has(holdingId)
      ) {
        return {
          data: null,
          error: { message: `Failed to update holding ${holdingId}` },
        };
      }
    }

    if (table === "holdings") {
      const holdingId = filters.get("id");
      const portfolioId = filters.get("portfolio_id");
      if (typeof holdingId === "string" && typeof portfolioId === "string") {
        mocked.updateHolding(holdingId, portfolioId, payload);
      }
    }

    for (const row of rows) {
      if (!matches(row as unknown as Record<string, unknown>)) continue;
      Object.assign(row, payload ?? {});
    }

    return { data: null, error: null as null | { message: string } };
  };

  const run = () => {
    if (mode === "select") return runSelect();
    return runUpdate();
  };

  const builder = {
    select: () => {
      mode = "select";
      return builder;
    },
    update: (nextPayload: Record<string, unknown>) => {
      mode = "update";
      payload = nextPayload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.set(column, value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.set(column, values);
      return builder;
    },
    order: () => builder,
    single: async () => {
      const result = run();
      const first = result.data?.[0] ?? null;
      return {
        data: first,
        error: first ? null : { message: "Not found" },
      };
    },
    maybeSingle: async () => {
      const result = run();
      return { data: result.data?.[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: { data: unknown; error: { message: string } | null }) => unknown) =>
      Promise.resolve(run()).then(onFulfilled),
  };

  return builder;
}

// Emulates the apply_holding_price_updates RPC: all-or-nothing, like the SQL function.
function applyHoldingPriceUpdates(params: {
  p_portfolio_id: string;
  p_updates: Array<Record<string, unknown>>;
  p_sync_state: "complete" | "partial";
  p_synced_at: string;
}) {
  const portfolio = mocked.state.portfolios.find(
    (row) => row.id === params.p_portfolio_id && row.user_id === mocked.state.authUserId,
  );
  if (!portfolio) return { data: null, error: { code: "42501", message: "Portfolio not found or unauthorized" } };
  for (const update of params.p_updates) {
    const id = update.id as string;
    if (mocked.failHoldingUpdateIds.has(id)) {
      return { data: null, error: { message: `Failed to update holding ${id}` } };
    }
  }
  for (const update of params.p_updates) {
    const row = mocked.state.holdings.find((holding) => holding.id === update.id);
    if (!row) return { data: null, error: { message: "holding not in portfolio" } };
    mocked.updateHolding(row.id, params.p_portfolio_id, update);
    row.allocation = update.allocation as number;
    if ("price" in update) {
      row.price = update.price as number;
      row.current_price = update.price as number;
      row.previous_close = (update.previousClose as number | null) ?? null;
      row.daily_change = update.dailyChange as number;
      row.quote_currency = update.currency as string;
      row.quote_as_of = update.quoteAsOf as string;
      row.fx_rate_to_usd = (update.fxRateToUsd as number | null) ?? null;
      row.fx_as_of = (update.fxAsOf as string | null) ?? null;
    }
  }
  if (params.p_sync_state === "complete") {
    portfolio.last_synced_at = params.p_synced_at;
    portfolio.sync_status = "active";
  } else {
    portfolio.sync_status = "stale";
  }
  return { data: params.p_updates.length, error: null };
}

const currentSupabase = {
  rpc: async (name: string, params: Parameters<typeof applyHoldingPriceUpdates>[0]) => {
    if (name !== "apply_holding_price_updates") throw new Error(`Unexpected rpc ${name}`);
    return applyHoldingPriceUpdates(params);
  },
  auth: {
    getUser: async () => ({
      data: {
        user: mocked.state.authUserId ? { id: mocked.state.authUserId } : null,
      },
      error: null,
    }),
  },
  from: (table: string) => {
    if (
      table !== "portfolios" &&
      table !== "holdings" &&
      table !== "ticker_earnings_reports"
    ) {
      throw new Error(`Unexpected table ${table}`);
    }

    return makeBuilder(table);
  },
};

vi.mock("next/cache", () => ({
  revalidatePath: mocked.revalidatePath,
}));

vi.mock("@/lib/services/yahoo-finance", () => ({
  getQuotes: mocked.getQuotes,
  getQuote: vi.fn(),
  searchSymbol: vi.fn(),
}));

vi.mock("@/lib/services/portfolio", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/services/portfolio")>(),
  computePortfolioOverview: mocked.computePortfolioOverview,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

import {
  refreshPortfolioPricingSnapshot,
  syncHoldingPricesIfStale,
} from "@/lib/actions/portfolio";

describe("portfolio price sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));
    mocked.getQuotes.mockReset();
    mocked.revalidatePath.mockReset();
    mocked.updateHolding.mockReset();
    mocked.computePortfolioOverview.mockReset();
    mocked.failHoldingUpdateIds = new Set<string>();

    mocked.state = {
      authUserId: "user-1",
      portfolios: [
        {
          id: "portfolio-1",
          user_id: "user-1",
          last_synced_at: "2026-03-25T11:30:00.000Z",
          sync_status: "active",
        },
      ],
      holdings: [
        {
          id: "holding-1",
          portfolio_id: "portfolio-1",
          symbol: "AAPL",
          quantity: 2,
          quote_as_of: "2026-03-25T11:20:00.000Z",
        },
        {
          id: "holding-2",
          portfolio_id: "portfolio-1",
          symbol: "MSFT",
          quantity: 3,
          quote_as_of: "2026-03-25T11:20:00.000Z",
        },
      ],
      ticker_earnings_reports: [],
    };

    mocked.getQuotes.mockResolvedValue(
      new Map([
        ["AAPL", { price: 100, dailyChange: 1, currency: "USD" }],
        ["MSFT", { price: 200, dailyChange: -0.5, currency: "USD" }],
      ]),
    );
    mocked.computePortfolioOverview.mockResolvedValue({
      totalValue: 800,
      dayChange: 0.1,
      monthlyChange: 0,
      lastSyncedAt: "Just now",
      lastAnalyzedAt: "Never",
      coverage: "0 high-signal stories",
      primaryGoal: "Compound around quality holdings and resilient names.",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips when portfolio last_synced_at is newer than the threshold", async () => {
    mocked.state.portfolios[0].last_synced_at = "2026-03-25T11:59:45.000Z";

    const result = await syncHoldingPricesIfStale("portfolio-1");

    expect(result).toEqual({ updated: 0, skipped: true, error: null });
    expect(mocked.getQuotes).not.toHaveBeenCalled();
  });

  it("skips when the latest holding quote_as_of is newer than the threshold", async () => {
    mocked.state.portfolios[0].last_synced_at = "2026-03-25T11:00:00.000Z";
    mocked.state.holdings[1].quote_as_of = "2026-03-25T11:59:40.000Z";

    const result = await syncHoldingPricesIfStale("portfolio-1");

    expect(result).toEqual({ updated: 0, skipped: true, error: null });
    expect(mocked.getQuotes).not.toHaveBeenCalled();
  });

  it("runs a real sync when prices are stale", async () => {
    const result = await syncHoldingPricesIfStale("portfolio-1", { minAgeMs: 60_000 });

    expect(result).toEqual({ updated: 2, skipped: false, error: null });
    expect(mocked.getQuotes).toHaveBeenCalledTimes(1);
    expect(mocked.updateHolding).toHaveBeenCalledTimes(2);

    const aapl = mocked.state.holdings.find((row) => row.id === "holding-1");
    const msft = mocked.state.holdings.find((row) => row.id === "holding-2");

    expect(aapl?.price).toBe(100);
    expect(aapl?.current_price).toBe(100);
    expect(aapl?.daily_change).toBe(1);
    expect(aapl?.quote_currency).toBe("USD");
    expect(aapl?.quote_as_of).toBe("2026-03-25T12:00:00.000Z");

    expect(msft?.price).toBe(200);
    expect(msft?.current_price).toBe(200);
    expect(msft?.daily_change).toBe(-0.5);
    expect(msft?.quote_currency).toBe("USD");
    expect(msft?.quote_as_of).toBe("2026-03-25T12:00:00.000Z");

    expect(mocked.state.portfolios[0].last_synced_at).toBe("2026-03-25T12:00:00.000Z");
    expect(mocked.state.portfolios[0].sync_status).toBe("active");
  });

  it("returns a non-fatal skipped result when a portfolio has no holdings", async () => {
    mocked.state.holdings = [];

    const result = await syncHoldingPricesIfStale("portfolio-1");

    expect(result).toEqual({ updated: 0, skipped: true, error: null });
    expect(mocked.getQuotes).not.toHaveBeenCalled();
  });

  it("handles quote provider failure without throwing", async () => {
    mocked.getQuotes.mockRejectedValue(new Error("provider unavailable"));

    await expect(syncHoldingPricesIfStale("portfolio-1")).resolves.toEqual({
      updated: 0,
      skipped: false,
      error: null,
    });
  });

  it("preserves auth and ownership checks", async () => {
    mocked.state.authUserId = null;

    const unauthorized = await syncHoldingPricesIfStale("portfolio-1");
    expect(unauthorized).toEqual({
      updated: 0,
      skipped: false,
      error: "Unauthorized",
    });

    mocked.state.authUserId = "user-1";
    mocked.state.portfolios[0].user_id = "someone-else";

    const notFound = await syncHoldingPricesIfStale("portfolio-1");
    expect(notFound).toEqual({
      updated: 0,
      skipped: false,
      error: "Portfolio not found",
    });
  });

  it("does not re-hit the quote provider on rapid repeated calls", async () => {
    const first = await syncHoldingPricesIfStale("portfolio-1");
    const second = await syncHoldingPricesIfStale("portfolio-1");

    expect(first).toEqual({ updated: 2, skipped: false, error: null });
    expect(second).toEqual({ updated: 0, skipped: true, error: null });
    expect(mocked.getQuotes).toHaveBeenCalledTimes(1);
  });

  it("saves nothing and says so when one holding update is rejected (atomic batch)", async () => {
    mocked.failHoldingUpdateIds = new Set(["holding-2"]);

    const result = await refreshPortfolioPricingSnapshot("portfolio-1");

    expect(result).toEqual({
      status: "error",
      updated: 0,
      message: "Failed to save refreshed holding prices. Nothing was changed.",
      overview: null,
    });
    expect(mocked.state.holdings.every((row) => row.price === undefined)).toBe(true);
    expect(mocked.state.portfolios[0].last_synced_at).toBe("2026-03-25T11:30:00.000Z");
  });

  it("reports a partial refresh without stamping a full sync or exceeding 100% allocation (B3)", async () => {
    mocked.state.holdings[0].current_price = 50;
    mocked.state.holdings[1].current_price = 50;
    mocked.state.holdings[0].quantity = 2;
    mocked.state.holdings[1].quantity = 2;
    mocked.getQuotes.mockResolvedValue(
      new Map([["AAPL", { price: 50, previousClose: 50, dailyChange: 0, currency: "USD" }]]),
    );

    const result = await refreshPortfolioPricingSnapshot("portfolio-1");

    expect(result.status).toBe("partial");
    expect(result.updated).toBe(1);
    expect(result.message).toContain("Updated 1 of 2 holdings");
    expect(result.message).toContain("MSFT");
    const allocations = mocked.state.holdings.map((row) => row.allocation);
    expect(allocations).toEqual([50, 50]);
    expect(mocked.state.portfolios[0].last_synced_at).toBe("2026-03-25T11:30:00.000Z");
    expect(mocked.state.portfolios[0].sync_status).toBe("stale");
    expect(mocked.state.holdings[1].quote_as_of).toBe("2026-03-25T11:20:00.000Z");
  });

  it("can return refreshed holdings for the full-portfolio section", async () => {
    const result = await refreshPortfolioPricingSnapshot("portfolio-1", {
      includeHoldings: true,
    });

    expect(result.status).toBe("updated");
    expect(result.holdings).toHaveLength(2);
    expect(result.holdings?.[0]).toMatchObject({
      id: "holding-1",
      symbol: "AAPL",
      currentPrice: 100,
    });
  });

  it("returns a no-quotes status when live quotes are unavailable", async () => {
    mocked.getQuotes.mockRejectedValue(new Error("provider unavailable"));

    const result = await refreshPortfolioPricingSnapshot("portfolio-1");

    expect(result).toEqual({
      status: "no_quotes",
      updated: 0,
      message: "Live quotes are unavailable right now. Showing last known prices.",
      overview: null,
    });
  });

  it("returns an error status for unauthorized manual refresh", async () => {
    mocked.state.authUserId = null;

    const result = await refreshPortfolioPricingSnapshot("portfolio-1");

    expect(result).toEqual({
      status: "error",
      updated: 0,
      message: "Unauthorized",
      overview: null,
    });
  });

});
