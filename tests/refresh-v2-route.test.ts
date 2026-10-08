import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ADMIN_USER_IDS = process.env.ADMIN_USER_IDS;

const mockResolveGlobalTickers = vi.fn();
const mockRunPythonWorkerV2 = vi.fn();
const mockIngestNewsToSupabase = vi.fn();
const mockRunAnalysis = vi.fn();
const mockGetNewsPoolSnapshot24h = vi.fn();
const mockExtractPublisherContent = vi.fn();
const mockBuildPortfolioQueries = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => "service-mock",
}));

vi.mock("@/lib/services/ticker-resolver", () => ({
  resolveGlobalTickers: (...args: unknown[]) => mockResolveGlobalTickers(...args),
}));

vi.mock("@/lib/services/news/worker", () => ({
  runPythonWorkerV2: (...args: unknown[]) => mockRunPythonWorkerV2(...args),
}));

vi.mock("@/lib/services/news", () => ({
  ingestNewsToSupabase: (...args: unknown[]) => mockIngestNewsToSupabase(...args),
  extractPublisherContent: (...args: unknown[]) => mockExtractPublisherContent(...args),
}));

vi.mock("@/lib/services/analysis", () => ({
  runAnalysis: (...args: unknown[]) => mockRunAnalysis(...args),
}));

vi.mock("@/lib/services/news/pool-snapshot", () => ({
  getNewsPoolSnapshot24h: (...args: unknown[]) => mockGetNewsPoolSnapshot24h(...args),
  newsWindowCutoffIso: () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
}));

vi.mock("@/lib/services/news/portfolio-queries", () => ({
  buildPortfolioQueries: (...args: unknown[]) => mockBuildPortfolioQueries(...args),
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
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "p1" }, error: null }),
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [{ id: "p1" }],
                      error: null,
                    }),
                }),
              }),
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ id: "p1" }],
                    error: null,
                  }),
              }),
            }),
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

import { POST } from "@/app/api/news/refresh-v2/route";

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

function defaultWorkerResult() {
  return {
    edgar: { ...emptyRow(), inserted: 1, fetched: 1, inserted_ids: ["id-e1"] },
    newsapi_ai: { ...emptyRow(), inserted: 2, fetched: 3, inserted_ids: ["id-na1", "id-na2"] },
    gnews: { ...emptyRow(), inserted: 1, fetched: 1, inserted_ids: ["id-g1"] },
    newscatcher: { ...emptyRow(), inserted: 1, fetched: 2, inserted_ids: ["id-nc1"] },
    total_inserted: 5,
    ingest_status: "success" as const,
  };
}

function makeRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost/api/news/refresh-v2", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("POST /api/news/refresh-v2", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = "user-1";

    mockResolveGlobalTickers.mockReset();
    mockRunPythonWorkerV2.mockReset();
    mockIngestNewsToSupabase.mockReset();
    mockRunAnalysis.mockReset();
    mockGetNewsPoolSnapshot24h.mockReset();
    mockExtractPublisherContent.mockReset();
    mockBuildPortfolioQueries.mockReset();

    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["MSFT", "AAPL"] });
    mockBuildPortfolioQueries.mockReturnValue(["AAPL Apple stock", "MSFT Microsoft stock"]);
    mockRunPythonWorkerV2.mockResolvedValue(defaultWorkerResult());
    mockExtractPublisherContent.mockResolvedValue({
      ...emptyExtractionStats(),
      queued: 5,
      attempted: 5,
      processedArticleIds: ["id-e1", "id-na1", "id-na2", "id-g1", "id-nc1"],
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 5, skipped: 0 });
    mockRunAnalysis.mockResolvedValue({
      runId: "run-1",
      error: null,
      meta: {
        poolCount24h: 5,
        latestPublishedAt24h: "2025-06-01T12:00:00Z",
        candidatesScored: 3,
        feedItemsCreated: 2,
      },
    });
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: { poolCount24h: 10, latestPublishedAt24h: "2025-06-01T12:00:00Z" },
    });

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterAll(() => {
    process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_USER_IDS;
  });

  /* ---------- Auth ---------- */

  it("returns 401 when unauthenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(401);
    expect(mockRunPythonWorkerV2).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    process.env.ADMIN_USER_IDS = "other-admin";

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(403);
    expect(mockRunPythonWorkerV2).not.toHaveBeenCalled();
  });

  /* ---------- Ingest stage formatting ---------- */

  it("formats ingest stage as empty when worker returns no articles", async () => {
    mockRunPythonWorkerV2.mockResolvedValue({
      edgar: emptyRow(),
      newsapi_ai: emptyRow(),
      gnews: emptyRow(),
      newscatcher: emptyRow(),
      total_inserted: 0,
      ingest_status: "empty",
      ingest_detail: "No articles in window",
    });
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: { poolCount24h: 0, latestPublishedAt24h: null },
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    const body = await res.json();

    expect(mockExtractPublisherContent).not.toHaveBeenCalled();
    expect(body.stages.extraction.status).toBe("skipped");
    expect(body.stages.extraction.detail).toBe("No new articles to extract");
  });

  it("upgrades empty ingest to success when 24h pool has rows", async () => {
    mockRunPythonWorkerV2.mockResolvedValue({
      edgar: emptyRow(),
      newsapi_ai: emptyRow(),
      gnews: emptyRow(),
      newscatcher: emptyRow(),
      total_inserted: 0,
      ingest_status: "empty",
    });
    mockGetNewsPoolSnapshot24h.mockResolvedValue({
      snapshot: { poolCount24h: 20, latestPublishedAt24h: "2025-06-01T10:00:00Z" },
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    const body = await res.json();

    expect(body.stages.ingest.status).toBe("success");
    expect(body.stages.ingest.detail).toContain("24-hour news pool still has articles");
  });

  /* ---------- Worker failure ---------- */

  it("returns 502 when worker has a top-level error with no ingest_status", async () => {
    mockRunPythonWorkerV2.mockResolvedValue({
      edgar: emptyRow(),
      newsapi_ai: emptyRow(),
      gnews: emptyRow(),
      newscatcher: emptyRow(),
      total_inserted: 0,
      error: "Python binary not found",
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.totalInserted).toBe(0);
    expect(body.analysisRunId).toBeNull();
  });

  it("returns 502 when ingest_status is failed", async () => {
    mockRunPythonWorkerV2.mockResolvedValue({
      edgar: emptyRow(),
      newsapi_ai: emptyRow(),
      gnews: emptyRow(),
      newscatcher: emptyRow(),
      total_inserted: 0,
      ingest_status: "failed",
      ingest_detail: "All candidate sources failed.",
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(502);
  });

  /* ---------- Extraction ---------- */

  it("reports extraction skip reasons", async () => {
    mockExtractPublisherContent.mockResolvedValue({
      ...emptyExtractionStats(),
      skipped: 5,
      skippedMissingUrl: 2,
      skippedUnsupportedSource: 1,
      skippedAlreadyExtracted: 2,
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    const body = await res.json();

    expect(body.stages.extraction.status).toBe("skipped");
    expect(body.stages.extraction.detail).toContain("2 missing URLs");
    expect(body.stages.extraction.detail).toContain("1 unsupported sources");
    expect(body.stages.extraction.detail).toContain("2 already extracted");
  });

  /* ---------- Enrichment + Analysis ---------- */

  it("returns 207 when enrichment fails", async () => {
    mockIngestNewsToSupabase.mockResolvedValue({
      enriched: 0,
      skipped: 0,
      error: "AI provider unavailable",
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.stages.enrichment.status).toBe("failed");
  });

  it("returns 207 when analysis fails", async () => {
    mockRunAnalysis.mockResolvedValue({
      runId: null,
      error: "analysis timed out",
      meta: null,
    });

    const res = await POST(makeRequest({ portfolioId: "p1" }));
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.stages.analysis.status).toBe("failed");
  });
});
