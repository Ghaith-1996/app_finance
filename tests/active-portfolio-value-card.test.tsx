import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioOverview } from "@/lib/types";

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

describe("ActivePortfolioValueCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshPortfolioPricingSnapshot.mockReset();
    mocked.routerRefresh.mockReset();
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
    expect(mocked.refreshPortfolioPricingSnapshot).not.toHaveBeenCalled();
  });

  it("updates the card in place on successful refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 2,
      message: "Updated 2 holdings.",
      overview: {
        ...initialOverview,
        totalValue: 20800,
        dayChange: 1.4,
        lastSyncedAt: "Just now",
      },
    });

    render(
      <ActivePortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={initialOverview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith(
        "portfolio-1",
      );
    });

    expect(await screen.findByText("$20,800.00")).toBeTruthy();
    expect(screen.getByText(/updated just now/i)).toBeTruthy();
    expect(screen.getByText("Updated 2 holdings.")).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });

  it("keeps previous values visible and shows inline status on no-quote refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "no_quotes",
      updated: 0,
      message: "Live quotes are unavailable right now. Try again shortly.",
      overview: null,
    });

    render(
      <ActivePortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={initialOverview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    expect(
      await screen.findByText("Live quotes are unavailable right now. Try again shortly."),
    ).toBeTruthy();
    expect(screen.getByText("$20,000.00")).toBeTruthy();
    expect(screen.getByText(/updated 5 minutes ago/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });

  it("keeps previous values visible and shows inline status on save failure", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "error",
      updated: 1,
      message: "Some refreshed holding prices could not be saved.",
      overview: null,
    });

    render(
      <ActivePortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={initialOverview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    expect(
      await screen.findByText("Some refreshed holding prices could not be saved."),
    ).toBeTruthy();
    expect(screen.getByText("$20,000.00")).toBeTruthy();
    expect(screen.getByText(/updated 5 minutes ago/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});
