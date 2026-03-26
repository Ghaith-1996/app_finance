import { beforeEach, describe, expect, it, vi } from "vitest";

const syncHoldingPricesIfStale = vi.fn();
const getPortfolioOverview = vi.fn();
const getPortfolio = vi.fn();

vi.mock("@/lib/actions/portfolio", () => ({
  syncHoldingPricesIfStale,
  getPortfolioOverview,
  getPortfolio,
}));

describe("portfolio refresh loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    syncHoldingPricesIfStale.mockResolvedValue({
      updated: 1,
      skipped: false,
      error: null,
    });

    getPortfolioOverview.mockResolvedValue({
      data: {
        totalValue: 1000,
        dayChange: 1,
        monthlyChange: 0,
        lastSyncedAt: "now",
        lastAnalyzedAt: "now",
        coverage: "1 story",
        primaryGoal: "goal",
      },
      error: null,
    });

    getPortfolio.mockResolvedValue({
      data: { holdings: [] },
      error: null,
    });
  });

  it("deduplicates sync work for the full-portfolio loader within the same request", async () => {
    const { loadFreshFullPortfolioAfterPriceSync } = await import(
      "@/lib/server/portfolio-refresh-loaders"
    );

    const [a, b] = await Promise.all([
      loadFreshFullPortfolioAfterPriceSync("portfolio-1"),
      loadFreshFullPortfolioAfterPriceSync("portfolio-1"),
    ]);

    expect(a).toEqual(b);
    expect(syncHoldingPricesIfStale).toHaveBeenCalledTimes(1);
    expect(getPortfolio).toHaveBeenCalledTimes(1);
    expect(getPortfolioOverview).toHaveBeenCalledTimes(1);
  });
});
