import { beforeEach, describe, expect, it, vi } from "vitest";

const syncHoldingPricesIfStale = vi.fn();
const getPortfolioOverview = vi.fn();

vi.mock("@/lib/actions/portfolio", () => ({
  syncHoldingPricesIfStale: (...args: unknown[]) => syncHoldingPricesIfStale(...args),
  getPortfolioOverview: (...args: unknown[]) => getPortfolioOverview(...args),
}));

describe("POST /api/portfolio/sync-prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    syncHoldingPricesIfStale.mockResolvedValue({
      updated: 2,
      skipped: false,
      error: null,
    });

    getPortfolioOverview.mockResolvedValue({
      data: {
        totalValue: 25000,
        dayChange: 1.5,
        monthlyChange: 0,
        lastSyncedAt: "Just now",
        lastAnalyzedAt: "2 hours ago",
        coverage: "5 high-signal stories",
        primaryGoal: "Compound around quality holdings.",
      },
      error: null,
    });
  });

  it("returns 400 when portfolioId is missing", async () => {
    const { POST } = await import("@/app/api/portfolio/sync-prices/route");

    const response = await POST(
      new Request("http://localhost/api/portfolio/sync-prices", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing portfolioId" });
  });

  it("syncs stale holdings with a 5 minute threshold and returns refreshed overview", async () => {
    const { POST } = await import("@/app/api/portfolio/sync-prices/route");

    const response = await POST(
      new Request("http://localhost/api/portfolio/sync-prices", {
        method: "POST",
        body: JSON.stringify({ portfolioId: "portfolio-1" }),
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(syncHoldingPricesIfStale).toHaveBeenCalledWith("portfolio-1", {
      minAgeMs: 5 * 60_000,
    });
    expect(getPortfolioOverview).toHaveBeenCalledWith("portfolio-1");
    await expect(response.json()).resolves.toEqual({
      updated: 2,
      skipped: false,
      error: null,
      overview: expect.objectContaining({
        totalValue: 25000,
        lastSyncedAt: "Just now",
      }),
    });
  });
});
