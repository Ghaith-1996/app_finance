import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveGlobalTickers = vi.fn();
const mockRunPythonWorker = vi.fn();
const mockIngestNewsToSupabase = vi.fn();
const mockRunAnalysis = vi.fn();
const mockGetNewsPoolSnapshot24h = vi.fn();
const mockIngestFinnhubPortfolioNews = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => "service-mock",
}));

vi.mock("@/lib/services/ticker-resolver", () => ({
  resolveGlobalTickers: (...args: unknown[]) => mockResolveGlobalTickers(...args),
}));

vi.mock("@/lib/services/news/worker", () => ({
  runPythonWorker: (...args: unknown[]) => mockRunPythonWorker(...args),
}));

const mockExtractPublisherContent = vi.fn();

vi.mock("@/lib/services/news", () => ({
  ingestNewsToSupabase: (...args: unknown[]) => mockIngestNewsToSupabase(...args),
  extractPublisherContent: (...args: unknown[]) => mockExtractPublisherContent(...args),
}));

vi.mock("@/lib/services/news/finnhub-refresh", () => ({
  ingestFinnhubPortfolioNews: (...args: unknown[]) => mockIngestFinnhubPortfolioNews(...args),
}));

vi.mock("@/lib/services/analysis", () => ({
  runAnalysis: (...args: unknown[]) => mockRunAnalysis(...args),
}));

vi.mock("@/lib/services/news/pool-snapshot", () => ({
  getNewsPoolSnapshot24h: (...args: unknown[]) => mockGetNewsPoolSnapshot24h(...args),
  newsWindowCutoffIso: () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
}));

function createSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: (col: string) => {
              if (col === "user_id") {
                return {
                  order: () => ({
                    limit: () =>
                      Promise.resolve({ data: [{ id: "p1" }], error: null }),
                  }),
                };
              }
              if (col === "id") {
                return {
                  eq: () => ({
                    single: () =>
                      Promise.resolve({ data: { id: "p1" }, error: null }),
                  }),
                };
              }
              return {};
            },
          }),
        };
      }
      if (table === "holdings") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { symbol: "AAPL", company: "Apple Inc" },
                  { symbol: "MSFT", company: "Microsoft Corporation" },
                ],
                error: null,
              }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({}) }) };
    },
  };
}

const supabaseMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock,
}));

import { POST } from "@/app/api/news/refresh/route";

function emptyRow() {
  return { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] };
}

function emptyExtractionStats() {
  return {
    queued: 0,
    attempted: 0,
    extracted: 0,
    skipped: 0,
    failed: 0,
    skippedMissingUrl: 0,
    skippedUnsupportedSource: 0,
    skippedAlreadyExtracted: 0,
    skippedUnsupportedUrl: 0,
    errors: [],
    background: true,
    processedArticleIds: [],
  };
}

describe("POST /api/news/refresh", () => {
  beforeEach(() => {
    mockResolveGlobalTickers.mockReset();
    mockRunPythonWorker.mockReset();
    mockIngestNewsToSupabase.mockReset();
    mockRunAnalysis.mockReset();
    mockGetNewsPoolSnapshot24h.mockReset();
    mockIngestFinnhubPortfolioNews.mockReset();
    mockExtractPublisherContent.mockReset();
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: { poolCount24h: 0, latestPublishedAt24h: null },
    });
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["MSFT", "AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: { ...emptyRow(), inserted: 1, fetched: 1, inserted_ids: ["id-e1"] },
      newsapi: { ...emptyRow(), inserted: 2, fetched: 2, inserted_ids: ["id-n1", "id-n2"] },
      gnews: { ...emptyRow(), inserted: 1, fetched: 1, inserted_ids: ["id-g1"] },
      total_inserted: 4,
      ingest_status: "success",
    });
    mockIngestFinnhubPortfolioNews.mockResolvedValue({
      ...emptyRow(),
      inserted: 2,
      fetched: 3,
      inserted_ids: ["id-f1", "id-f2"],
      fetch_outcome: "ok",
    });
    mockExtractPublisherContent.mockResolvedValue({
      ...emptyExtractionStats(),
      queued: 6,
      attempted: 6,
      processedArticleIds: ["id-e1", "id-n1", "id-n2", "id-g1", "id-f1", "id-f2"],
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 4, skipped: 0 });
    mockRunAnalysis.mockResolvedValue({
      runId: "run-1",
      error: null,
      meta: {
        poolCount24h: 0,
        latestPublishedAt24h: null,
        candidatesScored: 0,
        feedItemsCreated: 0,
      },
    });
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("uses global tickers for broad ingest, adds Finnhub portfolio news, then analyzes the portfolio", async () => {
    const res = await POST(
      new Request("http://localhost/api/news/refresh", {
        method: "POST",
        body: JSON.stringify({ portfolioId: "p1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockResolveGlobalTickers).toHaveBeenCalledWith("service-mock");
    expect(mockRunPythonWorker).toHaveBeenCalledWith(["MSFT", "AAPL"], 24, 20);
    expect(mockIngestFinnhubPortfolioNews).toHaveBeenCalledWith(
      "service-mock",
      [
        { symbol: "AAPL", company: "Apple Inc" },
        { symbol: "MSFT", company: "Microsoft Corporation" },
      ],
      24,
      20,
    );
    expect(mockExtractPublisherContent).toHaveBeenCalledWith(
      supabaseMock,
      { articleIds: ["id-e1", "id-n1", "id-n2", "id-g1", "id-f1", "id-f2"] },
    );
    expect(mockIngestNewsToSupabase).toHaveBeenCalledWith(
      supabaseMock,
      { sourceTypes: ["edgar", "newsapi", "gnews", "finnhub"], limit: 11 },
    );
    expect(mockRunAnalysis).toHaveBeenCalledWith(supabaseMock, "p1");
    expect(body.ingestBreakdown.edgar.inserted).toBe(1);
    expect(body.ingestBreakdown.newsapi.inserted).toBe(2);
    expect(body.ingestBreakdown.gnews.inserted).toBe(1);
    expect(body.ingestBreakdown.finnhub.inserted).toBe(2);
    expect(body.analysisRunId).toBe("run-1");
    expect(body.tickers).toEqual(["MSFT", "AAPL"]);
    expect(body.poolSnapshot).toEqual({ poolCount24h: 0, latestPublishedAt24h: null });
    expect(body.totalInserted).toBe(6);
    expect(body.analysisMeta?.feedItemsCreated).toBe(0);
    expect(body.stages.extraction.status).toBe("queued");
    expect(body.extractionStats.queued).toBe(6);
  });

  it("reports skip reasons when extraction skips all articles", async () => {
    mockExtractPublisherContent.mockResolvedValue({
      ...emptyExtractionStats(),
      skipped: 4,
      skippedMissingUrl: 2,
      skippedUnsupportedSource: 2,
    });
    const res = await POST(
      new Request("http://localhost/api/news/refresh", {
        method: "POST",
        body: JSON.stringify({ portfolioId: "p1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await res.json();
    expect(body.stages.extraction.status).toBe("skipped");
    expect(body.stages.extraction.detail).toContain("2 missing URLs");
    expect(body.stages.extraction.detail).toContain("2 unsupported sources");
    expect(body.extractionStats.skippedMissingUrl).toBe(2);
    expect(body.extractionStats.skippedUnsupportedSource).toBe(2);
  });

  it("does not call extraction when no articles were inserted", async () => {
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(),
      newsapi: emptyRow(),
      gnews: emptyRow(),
      total_inserted: 0,
      ingest_status: "empty",
      ingest_detail: "No articles in window",
    });
    mockIngestFinnhubPortfolioNews.mockResolvedValue({
      ...emptyRow(),
      fetch_outcome: "empty_window",
    });
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: { poolCount24h: 5, latestPublishedAt24h: "2025-03-20T12:00:00.000Z" },
    });

    const res = await POST(
      new Request("http://localhost/api/news/refresh", {
        method: "POST",
        body: JSON.stringify({ portfolioId: "p1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await res.json();
    expect(mockExtractPublisherContent).not.toHaveBeenCalled();
    expect(body.stages.extraction.status).toBe("skipped");
    expect(body.stages.extraction.detail).toBe("No new articles to extract");
  });

  it("when ingest is empty but the stored 24h pool has rows, poolSnapshot is non-zero and ingest is normalized", async () => {
    mockRunPythonWorker.mockResolvedValue({
      edgar: { ...emptyRow(), fetched: 0 },
      newsapi: { ...emptyRow(), fetched: 0 },
      gnews: { ...emptyRow(), fetched: 0 },
      total_inserted: 0,
      ingest_status: "empty",
      ingest_detail: "No articles in window",
    });
    mockIngestFinnhubPortfolioNews.mockResolvedValue({
      ...emptyRow(),
      fetch_outcome: "empty_window",
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 0, skipped: 0 });
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: {
        poolCount24h: 12,
        latestPublishedAt24h: "2025-03-20T12:00:00.000Z",
        bySource: { edgar: 12 },
      },
    });
    mockRunAnalysis.mockResolvedValue({
      runId: "run-2",
      error: null,
      meta: {
        poolCount24h: 12,
        latestPublishedAt24h: "2025-03-20T12:00:00.000Z",
        candidatesScored: 10,
        feedItemsCreated: 0,
      },
    });

    const res = await POST(
      new Request("http://localhost/api/news/refresh", {
        method: "POST",
        body: JSON.stringify({ portfolioId: "p1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poolSnapshot.poolCount24h).toBe(12);
    expect(body.stages.ingest.status).toBe("success");
    expect(body.stages.ingest.detail).toContain("No new articles fetched this run");
    expect(body.analysisMeta.feedItemsCreated).toBe(0);
  });
});
