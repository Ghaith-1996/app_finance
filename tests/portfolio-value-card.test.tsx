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
import { PortfolioValueCard } from "@/components/app/portfolio-value-card";
import { PortfolioSnapshotPanel } from "@/components/app/portfolio-snapshot-panel";

function overview(overrides: Partial<PortfolioOverview> = {}): PortfolioOverview {
  return {
    totalValue: 20000,
    dayChange: 1,
    monthlyChange: 0,
    lastSyncedAt: "5 minutes ago",
    lastAnalyzedAt: "2 hours ago",
    coverage: "4 high-signal stories",
    primaryGoal: "Stay balanced",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocked.refreshPortfolioPricingSnapshot.mockReset();
  mocked.routerRefresh.mockReset();
});

describe("PortfolioValueCard", () => {
  it("updates the overview card locally from the refresh result", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 1,
      message: "Updated 1 holding.",
      overview: overview({
        totalValue: 18250, dayChange: 0.9, lastSyncedAt: "Just now",
        lastAnalyzedAt: "1 hour ago", coverage: "4 stories",
      }),
    });
    render(
      <PortfolioValueCard
        portfolioId="portfolio-1"
        initialOverview={{ totalValue: 17900, dayChange: 0.4, lastSyncedAt: "2 mins ago" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith("portfolio-1"));
    expect(await screen.findByText("$18,250")).toBeTruthy();
    // Signed day change states its daily basis (F10/F11).
    expect(screen.getByText(/\+0\.90% today/i)).toBeTruthy();
    expect(screen.getByText(/updated just now/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});

describe("ActivePortfolioValueCard", () => {
  it("updates the card in place on successful refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 2,
      message: "Updated 2 holdings.",
      overview: overview({ totalValue: 20800, dayChange: 1.4, lastSyncedAt: "Just now" }),
    });
    render(<ActivePortfolioValueCard portfolioId="portfolio-1" initialOverview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith("portfolio-1"));
    expect(await screen.findByText("$20,800.00")).toBeTruthy();
    expect(screen.getByText(/updated just now/i)).toBeTruthy();
    expect(screen.getByText("Updated 2 holdings.")).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: "keeps previous values visible and shows inline status on no-quote refresh",
      status: "no_quotes",
      updated: 0,
      message: "Live quotes are unavailable right now. Try again shortly.",
    },
    {
      title: "keeps previous values visible and shows inline status on save failure",
      status: "error",
      updated: 1,
      message: "Some refreshed holding prices could not be saved.",
    },
  ])("$title", async ({ status, updated, message }) => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({ status, updated, message, overview: null });
    render(<ActivePortfolioValueCard portfolioId="portfolio-1" initialOverview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("$20,000.00")).toBeTruthy();
    expect(screen.getByText(/updated 5 minutes ago/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});

describe("PortfolioSnapshotPanel", () => {
  it("updates snapshot values locally on successful refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "updated",
      updated: 2,
      message: "Updated 2 holdings.",
      overview: overview({
        totalValue: 21500, dayChange: 1.5, monthlyChange: 4.2,
        lastSyncedAt: "Just now", coverage: "9 high-signal stories",
      }),
    });
    render(
      <PortfolioSnapshotPanel
        portfolioId="portfolio-1"
        initialOverview={{ totalValue: 20000, dayChange: 1, monthlyChange: 3, lastSyncedAt: "10 mins ago", coverage: "4 stories" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith("portfolio-1"));
    expect(await screen.findByText("$21,500")).toBeTruthy();
    expect(screen.getByText("+1.50%")).toBeTruthy();
    // Monthly change is not computed; the surface must keep it unknown.
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("+4.20%")).toBeNull();
    expect(screen.getByText("Just now")).toBeTruthy();
    expect(screen.getByText("9 high-signal stories")).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});
