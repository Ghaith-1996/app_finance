import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit B1 (application side). Transactional behaviour itself is proven against Postgres in
// supabase/tests/032_atomic_holdings_save.test.sql; this covers the action contract around it.

const mocked = vi.hoisted(() => ({
  rpc: vi.fn(),
  getQuotes: vi.fn(),
  revalidatePath: vi.fn(),
  authUserId: "user-1" as string | null,
}));

function selectBuilder(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "Not found" } }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocked.authUserId ? { id: mocked.authUserId } : null },
        error: null,
      }),
    },
    rpc: mocked.rpc,
    from: (table: string) =>
      selectBuilder(
        table === "portfolios"
          ? [{ id: "portfolio-1", user_id: "user-1" }]
          : table === "holdings"
            ? [{ id: "h1", symbol: "AAPL", quantity: 1, current_price: 0, quote_currency: "USD" }]
            : [],
      ),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocked.revalidatePath }));
vi.mock("@/lib/services/yahoo-finance", () => ({
  getQuotes: mocked.getQuotes,
  getQuote: vi.fn(),
  searchSymbol: vi.fn(),
}));

import { saveHoldings } from "@/lib/actions/portfolio";

const holding = (overrides: Record<string, unknown> = {}) => ({
  symbol: "aapl",
  company: "Apple",
  quantity: 10,
  averageCost: 150,
  sector: "Tech",
  market: "NASDAQ",
  importSource: "csv",
  ...overrides,
});

describe("saveHoldings (B1)", () => {
  beforeEach(() => {
    mocked.rpc.mockReset();
    mocked.getQuotes.mockReset();
    mocked.revalidatePath.mockReset();
    mocked.authUserId = "user-1";
    mocked.getQuotes.mockRejectedValue(new Error("quotes down"));
  });

  it("commits through the atomic RPC with normalized, validated holdings", async () => {
    mocked.rpc.mockImplementation(async (name: string) =>
      name === "save_portfolio_holdings" ? { data: "portfolio-1", error: null } : { data: null, error: null },
    );

    const result = await saveHoldings({ portfolioId: "portfolio-1", mode: "replace", sourceType: "csv", holdings: [holding()] });

    expect(result).toMatchObject({ error: null, portfolioId: "portfolio-1" });
    expect(mocked.rpc).toHaveBeenCalledWith("save_portfolio_holdings", {
      p_portfolio_id: "portfolio-1",
      p_portfolio_name: null,
      p_source_type: "csv",
      p_mode: "replace",
      p_holdings: [
        {
          symbol: "AAPL",
          company: "Apple",
          quantity: 10,
          averageCost: 150,
          sector: "Tech",
          market: "NASDAQ",
          thesis: null,
          importSource: "csv",
        },
      ],
    });
  });

  it("never reports success when the transactional save fails, and keeps the existing portfolio id", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "Simulated storage failure" } });

    const result = await saveHoldings({ portfolioId: "portfolio-1", mode: "merge", holdings: [holding()] });

    expect(result.error).toMatch(/previous holdings were not changed/);
    expect(result.portfolioId).toBe("portfolio-1");
    expect(mocked.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps ownership rejection from the database boundary", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Portfolio not found or unauthorized" } });

    const result = await saveHoldings({ portfolioId: "someone-elses", mode: "replace", holdings: [holding()] });

    expect(result.error).toBe("Portfolio not found or unauthorized.");
  });

  it.each([
    ["empty list", []],
    ["duplicate symbols", [holding(), holding({ symbol: "AAPL " })]],
    ["zero quantity", [holding({ quantity: 0 })]],
    ["negative cost", [holding({ averageCost: -1 })]],
    ["non-numeric quantity", [holding({ quantity: "10" })]],
    ["NaN cost", [holding({ averageCost: Number.NaN })]],
    ["bad symbol", [holding({ symbol: "<script>" })]],
    ["unknown import source", [holding({ importSource: "broker" })]],
    ["not an array", "AAPL"],
  ])("rejects %s before any database write", async (_label, holdings) => {
    const result = await saveHoldings({
      portfolioId: "portfolio-1",
      mode: "replace",
      holdings: holdings as never,
    });

    expect(result.error).toBeTruthy();
    expect(result.portfolioId).toBe("portfolio-1");
    expect(mocked.rpc).not.toHaveBeenCalled();
  });

  it("treats quote enrichment as separate: a saved import with no quotes is still a truthful success", async () => {
    mocked.rpc.mockResolvedValue({ data: "portfolio-1", error: null });

    const result = await saveHoldings({ portfolioId: null, mode: "replace", holdings: [holding()] });

    expect(result).toMatchObject({ error: null, portfolioId: "portfolio-1", pricingStatus: "no_quotes" });
    expect(mocked.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated callers", async () => {
    mocked.authUserId = null;
    const result = await saveHoldings({ portfolioId: null, mode: "replace", holdings: [holding()] });
    expect(result.error).toBe("Unauthorized");
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
});
