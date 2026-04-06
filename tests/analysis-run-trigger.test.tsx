import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

import { AnalysisRunTrigger } from "@/components/app/analysis-run-trigger";

describe("AnalysisRunTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders idle state without a refresh button", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: null, portfolioId: "p1" }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    expect(screen.getByText("Waiting for next update")).toBeTruthy();
    expect(screen.getAllByText(/20 minutes/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  });

  it("shows progress when run is active", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run: {
          id: "run-1",
          status: "mapping_news",
          progress: 45,
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "2 hours ago" }}
        />,
      );
    });

    expect(screen.getByText("45%")).toBeTruthy();
    expect(screen.getByText("Building portfolio-aware explanations")).toBeTruthy();
  });

  it("shows complete state with auto-update message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run: {
          id: "run-1",
          status: "complete",
          progress: 100,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Just now" }}
        />,
      );
    });

    expect(screen.getByText("Analysis complete")).toBeTruthy();
    expect(screen.getByText(/portfolio and watchlist/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  });

  it("shows degraded completion messaging when run status is degraded", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run: {
          id: "run-1",
          status: "degraded",
          progress: 100,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Just now" }}
        />,
      );
    });

    expect(screen.getByText(/limited confidence/i)).toBeTruthy();
    expect(screen.getByText(/results may be incomplete/i)).toBeTruthy();
  });
});
