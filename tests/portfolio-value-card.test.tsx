import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  refreshPortfolioPricingSnapshot: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocked.routerRefresh }),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  refreshPortfolioPricingSnapshot: mocked.refreshPortfolioPricingSnapshot,
}));

import { PortfolioValueCard } from "@/components/app/portfolio-value-card";

describe("PortfolioValueCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshPortfolioPricingSnapshot.mockReset();
    mocked.routerRefresh.mockReset();
  });

  it("updates the overview card locally from the refresh result", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 1,
      message: "Updated 1 holding.",
      overview: {
        totalValue: 18250,
        dayChange: 0.9,
        monthlyChange: 0,
        lastSyncedAt: "Just now",
        lastAnalyzedAt: "1 hour ago",
        coverage: "4 stories",
        primaryGoal: "Stay balanced",
      },
    });

    render(
      <PortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={{
          totalValue: 17900,
          dayChange: 0.4,
          lastSyncedAt: "2 mins ago",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith(
        "portfolio-1",
      );
    });

    expect(await screen.findByText("$18,250")).toBeTruthy();
    expect(screen.getByText(/\+0.9%/i)).toBeTruthy();
    expect(screen.getByText(/updated just now/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});
