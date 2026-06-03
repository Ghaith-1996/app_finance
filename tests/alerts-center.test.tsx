import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead: vi.fn(async () => ({ ok: true })),
  markAllAlertsRead: vi.fn(async () => ({ ok: true })),
}));

import { AlertsCenter } from "@/components/app/alerts-center";
import { markAlertRead } from "@/lib/actions/alerts";
import type { AlertCenterItem, AlertCenterSummary } from "@/lib/server/alerts";

const alerts: AlertCenterItem[] = [
  {
    id: "alert-1",
    alertType: "critical_news",
    severity: "high",
    title: "AAPL regulatory risk",
    message: "A critical article matched AAPL.",
    actionHref: "/feed?story=news-1",
    sourceTable: "news_items",
    sourceId: "news-1",
    triggeredAt: "2026-05-31T13:00:00.000Z",
    readAt: null,
    createdAt: "2026-05-31T13:00:00.000Z",
  },
  {
    id: "alert-2",
    alertType: "earnings_report",
    severity: "low",
    title: "MSFT report linked",
    message: "A new earnings report link is available.",
    actionHref: "/portfolio/full",
    sourceTable: "ticker_earnings_reports",
    sourceId: "msft",
    triggeredAt: "2026-05-31T12:00:00.000Z",
    readAt: "2026-05-31T12:05:00.000Z",
    createdAt: "2026-05-31T12:00:00.000Z",
  },
];

const summary: AlertCenterSummary = {
  total: 2,
  unread: 1,
  high: 1,
  criticalNews: 1,
  earnings: 1,
  priceMoves: 0,
  concentration: 0,
};

describe("AlertsCenter", () => {
  it("filters alerts and marks a single alert read", async () => {
    render(<AlertsCenter initialAlerts={alerts} summary={summary} />);

    expect(screen.getByText("AAPL regulatory risk")).toBeInTheDocument();
    expect(screen.getByText("MSFT report linked")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(screen.getByText("AAPL regulatory risk")).toBeInTheDocument();
    expect(screen.queryByText("MSFT report linked")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));

    await waitFor(() => {
      expect(markAlertRead).toHaveBeenCalledWith("alert-1");
    });
  });
});
