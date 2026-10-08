import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/portfolio", () => ({
  syncHoldingPricesIfStale: vi.fn(),
  getPortfolioOverview: vi.fn(),
}));

describe("POST /api/portfolio/sync-prices", () => {
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

});
