import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadWatchlistItems = vi.fn();
const refreshWatchlistPrices = vi.fn();
const WatchlistPageClient = vi.fn(({ items }: { items: Array<{ symbol: string }> }) => (
  <div>{`Watchlist client ${items.length}`}</div>
));

vi.mock("@/lib/actions/watchlist", () => ({
  loadWatchlistItems,
  refreshWatchlistPrices,
}));

vi.mock("@/components/app/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/app/watchlist-page-client", () => ({
  WatchlistPageClient: (props: { items: Array<{ symbol: string }> }) => WatchlistPageClient(props),
}));

vi.mock("@/lib/server/page-loaders", () => ({
  loadShellChromeState: vi.fn(async () => ({ showAdminLink: false })),
}));

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWatchlistItems.mockResolvedValue([
      {
        id: "item-1",
        symbol: "AAPL",
        company: "Apple",
        exchange: "NASDAQ",
        price: 100,
        dayChange: 1,
        currency: "USD",
      },
    ]);
  });

  it("loads cached watchlist items on the server without awaiting refresh", async () => {
    const { default: WatchlistPage } = await import("@/app/watchlist/page");

    const page = await WatchlistPage();
    await act(async () => {
      render(page);
    });

    expect(loadWatchlistItems).toHaveBeenCalledTimes(1);
    expect(refreshWatchlistPrices).not.toHaveBeenCalled();
    expect(screen.getByText("Watchlist client 1")).toBeTruthy();
    expect(WatchlistPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ symbol: "AAPL" })]),
      }),
    );
  });
});
