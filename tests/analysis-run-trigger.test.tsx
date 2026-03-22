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

vi.mock("@/lib/ingest-hint", () => ({
  writeLastIngestSnapshot: vi.fn(),
  readLastIngestSnapshot: () => null,
  isRecentIngestHint: () => false,
  LAST_INGEST_STORAGE_KEY: "test",
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

  it("renders idle state when no run exists", async () => {
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

    expect(screen.getByText("Ready to refresh")).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh news & analysis/i })).toBeTruthy();
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
        portfolioId: "p1",
      }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    expect(screen.getByText("45%")).toBeTruthy();
  });

  it("polls when run is active, stops when complete", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      const isComplete = callCount >= 3;
      return {
        ok: true,
        json: async () => ({
          run: {
            id: "run-1",
            status: isComplete ? "complete" : "processing_holdings",
            progress: isComplete ? 100 : 25,
            startedAt: new Date().toISOString(),
            completedAt: isComplete ? new Date().toISOString() : null,
          },
          portfolioId: "p1",
        }),
      };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    // Initial fetch
    expect(callCount).toBe(1);

    // Advance timers to trigger polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("shows completion state", async () => {
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
        portfolioId: "p1",
      }),
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    expect(screen.getByText("Analysis complete")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("renders diagnostics block when ingest is empty", async () => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) {
        return { ok: true, json: async () => ({ run: null }) };
      }
      return {
        ok: true,
        json: async () => ({
          portfolioId: "p1",
          tickers: ["AAPL"],
          lookbackHours: 24,
          stages: {
            ingest: { status: "empty", detail: "No articles returned" },
            enrichment: { status: "skipped", detail: "No new articles" },
            analysis: { status: "success", detail: "Run r1 complete" },
          },
          ingestBreakdown: {
            edgar: { fetched: 3, inserted: 0, skipped: 3, failed: 0, fetch_outcome: "ok" },
            newsapi: { fetched: 2, inserted: 0, skipped: 2, failed: 0, fetch_outcome: "ok" },
            total_inserted: 0,
          },
          totalInserted: 0,
          enriched: 0,
          analysisRunId: null,
        }),
      };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(screen.getByTestId("ingest-diagnostics")).toBeTruthy();
    expect(screen.getByText("EDGAR")).toBeTruthy();
    expect(screen.getByText("NewsAPI")).toBeTruthy();
    expect(screen.getByText("fetched 3")).toBeTruthy();
    expect(screen.getByText("already ingested 3")).toBeTruthy();
  });

  it("renders diagnostics block when ingest is partial", async () => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) {
        return { ok: true, json: async () => ({ run: null }) };
      }
      return {
        ok: true,
        json: async () => ({
          portfolioId: "p1",
          tickers: ["MSFT"],
          lookbackHours: 24,
          stages: {
            ingest: { status: "partial", detail: "EDGAR failed" },
            enrichment: { status: "skipped", detail: "No new articles" },
            analysis: { status: "success", detail: "Run r2 complete" },
          },
          ingestBreakdown: {
            edgar: { fetched: 0, inserted: 0, skipped: 0, failed: 0, fetch_outcome: "failed", fetch_error: "timeout" },
            newsapi: { fetched: 5, inserted: 3, skipped: 2, failed: 0, fetch_outcome: "ok" },
            total_inserted: 3,
          },
          totalInserted: 3,
          enriched: 3,
          analysisRunId: null,
        }),
      };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(screen.getByTestId("ingest-diagnostics")).toBeTruthy();
    expect(screen.getByText("timeout")).toBeTruthy();
    expect(screen.getByText("new 3")).toBeTruthy();
  });

  it("does not render diagnostics block on a normal success run", async () => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) {
        return { ok: true, json: async () => ({ run: null }) };
      }
      return {
        ok: true,
        json: async () => ({
          portfolioId: "p1",
          tickers: ["AAPL"],
          lookbackHours: 24,
          stages: {
            ingest: { status: "success", detail: "10 articles ingested" },
            enrichment: { status: "success", detail: "10 enriched" },
            analysis: { status: "success", detail: "Run r3 complete" },
          },
          ingestBreakdown: {
            edgar: { fetched: 5, inserted: 5, skipped: 0, failed: 0, fetch_outcome: "ok" },
            newsapi: { fetched: 5, inserted: 5, skipped: 0, failed: 0, fetch_outcome: "ok" },
            total_inserted: 10,
          },
          totalInserted: 10,
          enriched: 10,
          analysisRunId: "run-x",
        }),
      };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(screen.queryByTestId("ingest-diagnostics")).toBeNull();
  });

  it("when refresh reused pool (0 inserted) but feedItemsCreated=0, does not say feed is ready", async () => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      callIndex++;
      if (url.includes("/api/news/refresh")) {
        return {
          ok: true,
          json: async () => ({
            portfolioId: "p1",
            lookbackHours: 24,
            totalInserted: 0,
            poolSnapshot: {
              poolCount24h: 8,
              latestPublishedAt24h: "2025-03-20T15:00:00.000Z",
            },
            analysisMeta: {
              poolCount24h: 8,
              latestPublishedAt24h: "2025-03-20T15:00:00.000Z",
              candidatesScored: 8,
              feedItemsCreated: 0,
            },
            stages: {
              ingest: { status: "success", detail: "No new articles fetched" },
              enrichment: { status: "skipped", detail: "—" },
              analysis: { status: "success", detail: "done" },
            },
            ingestBreakdown: {},
            analysisRunId: "run-pool",
          }),
        };
      }
      if (url.includes("runId=")) {
        return {
          ok: true,
          json: async () => ({
            id: "run-pool",
            status: "complete",
            progress: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, json: async () => ({ run: null }) };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(screen.queryByText(/your feed is ready/i)).toBeNull();
    expect(screen.getByText(/analysis complete/i)).toBeTruthy();
    expect(
      screen.getByText(/no stories met the relevance bar/i),
    ).toBeTruthy();
  });

  it("when pool is empty, hero explains no articles in 24h pool", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/news/refresh")) {
        return {
          ok: true,
          json: async () => ({
            portfolioId: "p1",
            lookbackHours: 24,
            totalInserted: 0,
            poolSnapshot: { poolCount24h: 0, latestPublishedAt24h: null },
            analysisMeta: {
              poolCount24h: 0,
              latestPublishedAt24h: null,
              candidatesScored: 0,
              feedItemsCreated: 0,
            },
            stages: {
              ingest: { status: "empty", detail: "—" },
              enrichment: { status: "skipped", detail: "—" },
              analysis: { status: "success", detail: "done" },
            },
            ingestBreakdown: {},
            analysisRunId: "run-empty",
          }),
        };
      }
      if (url.includes("runId=")) {
        return {
          ok: true,
          json: async () => ({
            id: "run-empty",
            status: "complete",
            progress: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, json: async () => ({ run: null }) };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(
      screen.getByText(/no articles are currently available in the 24-hour news pool/i),
    ).toBeTruthy();
  });

  it("when pool has articles and feed items were created, shows feed-ready hero", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/news/refresh")) {
        return {
          ok: true,
          json: async () => ({
            portfolioId: "p1",
            lookbackHours: 24,
            totalInserted: 3,
            poolSnapshot: {
              poolCount24h: 10,
              latestPublishedAt24h: "2025-03-20T12:00:00.000Z",
            },
            analysisMeta: {
              poolCount24h: 10,
              latestPublishedAt24h: "2025-03-20T12:00:00.000Z",
              candidatesScored: 10,
              feedItemsCreated: 2,
            },
            stages: {
              ingest: { status: "success", detail: "ok" },
              enrichment: { status: "success", detail: "ok" },
              analysis: { status: "success", detail: "ok" },
            },
            ingestBreakdown: {},
            analysisRunId: "run-feed",
          }),
        };
      }
      if (url.includes("runId=")) {
        return {
          ok: true,
          json: async () => ({
            id: "run-feed",
            status: "complete",
            progress: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, json: async () => ({ run: null }) };
    });

    await act(async () => {
      render(
        <AnalysisRunTrigger
          portfolioId="p1"
          defaultOverview={{ lastAnalyzedAt: "Never" }}
        />,
      );
    });

    const btn = screen.getByRole("button", { name: /refresh news & analysis/i });
    await act(async () => {
      btn.click();
    });

    expect(screen.getByText(/your feed is ready/i)).toBeTruthy();
    expect(
      screen.getByText(/open the feed to see personalized stories matched to your portfolio/i),
    ).toBeTruthy();
  });
});
