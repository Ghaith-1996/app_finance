import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchlistItemData } from "@/lib/watchlist/watchlist-data";

const mocked = vi.hoisted(() => ({
  refreshWatchlistPrices: vi.fn(),
  deleteWatchlistItem: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocked.routerRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/watchlist", () => ({
  refreshWatchlistPrices: mocked.refreshWatchlistPrices,
  deleteWatchlistItem: mocked.deleteWatchlistItem,
}));

import { WatchlistItems } from "@/components/app/watchlist-items";

const initialItems: WatchlistItemData[] = [
  {
    id: "item-1",
    symbol: "AAPL",
    company: "Apple",
    exchange: "NASDAQ",
    price: 100,
    dayChange: 1,
    currency: "USD",
  },
];

describe("WatchlistItems", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshWatchlistPrices.mockReset();
    mocked.deleteWatchlistItem.mockReset();
    mocked.routerRefresh.mockReset();
    mocked.deleteWatchlistItem.mockResolvedValue({ ok: true });
  });

  it("triggers one silent auto refresh on mount and updates prices", async () => {
    mocked.refreshWatchlistPrices.mockResolvedValue([
      {
        ...initialItems[0],
        price: 101.25,
        dayChange: 1.5,
      },
    ]);

    const { rerender } = render(
      <WatchlistItems
        initialItems={initialItems}
        selectedSymbol={null}
        onSelectSymbol={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mocked.refreshWatchlistPrices).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("$101.25")).toBeTruthy();

    rerender(
      <WatchlistItems
        initialItems={initialItems}
        selectedSymbol={null}
        onSelectSymbol={() => {}}
      />,
    );

    expect(mocked.refreshWatchlistPrices).toHaveBeenCalledTimes(1);
  });

  it("keeps cached values and stays quiet when auto refresh fails", async () => {
    mocked.refreshWatchlistPrices.mockRejectedValue(new Error("timeout"));

    render(
      <WatchlistItems
        initialItems={initialItems}
        selectedSymbol={null}
        onSelectSymbol={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mocked.refreshWatchlistPrices).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("$100.00")).toBeTruthy();
    expect(screen.queryByText("Refresh failed. Try again.")).toBeNull();
  });

  it("shows a banner when manual refresh fails", async () => {
    mocked.refreshWatchlistPrices
      .mockResolvedValueOnce(initialItems)
      .mockRejectedValueOnce(new Error("timeout"));

    render(
      <WatchlistItems
        initialItems={initialItems}
        selectedSymbol={null}
        onSelectSymbol={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mocked.refreshWatchlistPrices).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh all prices/i }));

    await waitFor(() => {
      expect(mocked.refreshWatchlistPrices).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Refresh failed. Try again.")).toBeTruthy();
  });
});
