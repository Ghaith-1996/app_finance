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

import { PortfolioSnapshotPanel } from "@/components/app/portfolio-snapshot-panel";

describe("PortfolioSnapshotPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshPortfolioPricingSnapshot.mockReset();
    mocked.routerRefresh.mockReset();
  });

  it("updates snapshot values locally on successful refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 2,
      message: "Updated 2 holdings.",
      overview: {
        totalValue: 21500,
        dayChange: 1.5,
        monthlyChange: 4.2,
        lastSyncedAt: "Just now",
        lastAnalyzedAt: "2 hours ago",
        coverage: "9 high-signal stories",
        primaryGoal: "Stay balanced",
      },
    });

    render(
      <PortfolioSnapshotPanel
        portfolioId="portfolio-1"
        initialOverview={{
          totalValue: 20000,
          dayChange: 1,
          monthlyChange: 3,
          lastSyncedAt: "10 mins ago",
          coverage: "4 stories",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith(
        "portfolio-1",
      );
    });

    expect(await screen.findByText("$21,500")).toBeTruthy();
    expect(screen.getByText("+1.50%")).toBeTruthy();
    expect(screen.getByText("+4.20%")).toBeTruthy();
    expect(screen.getByText("Just now")).toBeTruthy();
    expect(screen.getByText("9 high-signal stories")).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});
