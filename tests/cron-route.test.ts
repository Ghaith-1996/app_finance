import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveGlobalTickers = vi.fn();
const mockRunPythonWorker = vi.fn();
const mockIngestNewsToSupabase = vi.fn();
const mockExtractPublisherContent = vi.fn();
const mockIngestFinnhubPortfolioNews = vi.fn();
const mockRunAnalysis = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

vi.mock("@/lib/services/ticker-resolver", () => ({
  resolveGlobalTickers: (...args: unknown[]) => mockResolveGlobalTickers(...args),
}));

vi.mock("@/lib/services/news/worker", () => ({
  runPythonWorker: (...args: unknown[]) => mockRunPythonWorker(...args),
}));

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

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "@/app/api/news/cron/route";

let mockSupabase: ReturnType<typeof buildMockSupabase>;

function buildMockSupabase(portfolios: Array<{ id: string; user_id: string }> = []) {
  return {
    from: (table: string) => {
      if (table === "holdings") {
        return {
          select: () => Promise.resolve({
            data: [{ symbol: "AAPL", company: "Apple" }],
            error: null,
          }),
        };
      }
      if (table === "watchlist_items") {
        return {
          select: () => Promise.resolve({
            data: [{ symbol: "TSLA", company: "Tesla" }],
            error: null,
          }),
        };
      }
      if (table === "portfolios") {
        return {
          select: () => Promise.resolve({
            data: portfolios,
            error: null,
          }),
        };
      }
      if (table === "analysis_runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeRequest(secret?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/news/cron", {
    method: "POST",
    headers,
  });
}

function emptyRow() {
  return { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] };
}

function emptyExtractionStats() {
  return {
    queued: 0, attempted: 0, extracted: 0, skipped: 0, failed: 0,
    skippedMissingUrl: 0, skippedUnsupportedSource: 0,
    skippedAlreadyExtracted: 0, skippedUnsupportedUrl: 0,
    errors: [], background: true, processedArticleIds: [],
  };
}

describe("POST /api/news/cron", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockResolveGlobalTickers.mockReset();
    mockRunPythonWorker.mockReset();
    mockIngestNewsToSupabase.mockReset();
    mockExtractPublisherContent.mockReset().mockResolvedValue(emptyExtractionStats());
    mockIngestFinnhubPortfolioNews.mockReset().mockResolvedValue({
      inserted: 0, updated: 0, skipped: 0, failed: 0,
      fetch_error: null, inserted_ids: [],
    });
    mockRunAnalysis.mockReset().mockResolvedValue({
      runId: "run-1", error: null, meta: { feedItemsCreated: 2 },
    });
    mockSupabase = buildMockSupabase([{ id: "p1", user_id: "u1" }]);
    process.env.CRON_SECRET = "test-secret";
    process.env.FINNHUB_API_KEY = "fk";
  });

  it("rejects missing secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("runs full pipeline with Finnhub and analysis", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL", "TSLA"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: { ...emptyRow(), fetched: 2, inserted: 1, inserted_ids: ["id-e1"] },
      newsapi: { ...emptyRow(), fetched: 10, inserted: 3, inserted_ids: ["id-n1", "id-n2", "id-n3"] },
      gnews: emptyRow(),
      total_inserted: 4,
      ingest_status: "success",
    });
    mockIngestFinnhubPortfolioNews.mockResolvedValue({
      inserted: 2, updated: 0, skipped: 0, failed: 0,
      fetch_error: null, inserted_ids: ["id-f1", "id-f2"],
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 6, skipped: 0 });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalInserted).toBe(6);
    expect(body.ingestBreakdown.finnhub.inserted).toBe(2);
    expect(mockExtractPublisherContent).toHaveBeenCalledWith(
      mockSupabase,
      { articleIds: ["id-e1", "id-n1", "id-n2", "id-n3", "id-f1", "id-f2"] },
    );
    expect(mockRunAnalysis).toHaveBeenCalledWith(mockSupabase, "p1");
    expect(body.analysis.portfoliosProcessed).toBe(1);
  });

  it("includes finnhub in enrichment source types", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(), newsapi: emptyRow(), gnews: emptyRow(),
      total_inserted: 0, ingest_status: "empty",
    });
    mockIngestFinnhubPortfolioNews.mockResolvedValue({
      inserted: 1, updated: 0, skipped: 0, failed: 0,
      fetch_error: null, inserted_ids: ["id-f1"],
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 1, skipped: 0 });

    await POST(makeRequest("test-secret"));

    expect(mockIngestNewsToSupabase).toHaveBeenCalledWith(mockSupabase, {
      sourceTypes: ["edgar", "newsapi", "gnews", "finnhub"],
      limit: expect.any(Number),
    });
  });

  it("skips analysis for recently analyzed portfolios", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = {
      ...buildMockSupabase([{ id: "p1", user_id: "u1" }]),
      from: (table: string) => {
        if (table === "portfolios") {
          return { select: () => Promise.resolve({ data: [{ id: "p1", user_id: "u1" }], error: null }) };
        }
        if (table === "analysis_runs") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({
                        data: { completed_at: recentlyCompleted },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return buildMockSupabase().from(table);
      },
    };

    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(), newsapi: emptyRow(), gnews: emptyRow(),
      total_inserted: 0, ingest_status: "empty",
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(body.analysis.portfoliosSkipped).toBe(1);
  });

  it("skips enrichment when no articles inserted", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(), newsapi: emptyRow(), gnews: emptyRow(),
      total_inserted: 0, ingest_status: "empty",
    });

    await POST(makeRequest("test-secret"));
    expect(mockIngestNewsToSupabase).not.toHaveBeenCalled();
  });
});
