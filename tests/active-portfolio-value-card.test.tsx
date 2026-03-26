import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioOverview } from "@/lib/types";

const mocked = vi.hoisted(() => ({
  refreshHoldingPrices: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocked.routerRefresh }),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  refreshHoldingPrices: mocked.refreshHoldingPrices,
}));

import { ActivePortfolioValueCard } from "@/components/app/active-portfolio-value-card";

const initialOverview: PortfolioOverview = {
  totalValue: 20000,
  dayChange: 1,
  monthlyChange: 0,
  lastSyncedAt: "5 minutes ago",
  lastAnalyzedAt: "2 hours ago",
  coverage: "4 high-signal stories",
  primaryGoal: "Stay balanced",
};

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ActivePortfolioValueCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshHoldingPrices.mockReset();
    mocked.routerRefresh.mockReset();
    global.fetch = vi.fn();
  });

  it("renders cached overview immediately without background sync", () => {
    render(
      <ActivePortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={initialOverview}
      />,
    );

    expect(screen.getByText("$20,000.00")).toBeTruthy();
    expect(screen.getByText(/updated 5 minutes ago/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh prices/i })).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refreshes prices only when the inline button is clicked", async () => {
    const deferred = createDeferred();
    mocked.refreshHoldingPrices.mockReturnValue(deferred.promise);

    render(
      <ActivePortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={initialOverview}
      />,
    );

    const button = screen.getByRole("button", { name: /refresh prices/i });
    fireEvent.click(button);

    expect(mocked.refreshHoldingPrices).toHaveBeenCalledWith("portfolio-1");
    expect(screen.getByText("Refreshing...")).toBeTruthy();

    deferred.resolve();

    await waitFor(() => {
      expect(mocked.routerRefresh).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Refresh")).toBeTruthy();
  });
});
