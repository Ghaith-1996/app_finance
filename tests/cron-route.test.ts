import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIngestNewsToSupabase,
  mockRunAnalysis,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockIngestNewsToSupabase: vi.fn(),
  mockRunAnalysis: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

vi.mock("@/lib/services/news", () => ({
  ingestNewsToSupabase: (...args: unknown[]) => mockIngestNewsToSupabase(...args),
}));

vi.mock("@/lib/services/analysis", () => ({
  runAnalysis: (...args: unknown[]) => mockRunAnalysis(...args),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

import { GET, POST } from "@/app/api/news/cron/route";

let mockSupabase: ReturnType<typeof buildMockSupabase>;

function buildMockSupabase(portfolios: Array<{ id: string; user_id: string }> = []) {
  return {
    from: (table: string) => {
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

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    tickers: ["AAPL", "TSLA"],
    lookbackHours: 24,
    maxArticles: 50,
    ingest_status: "success",
    ingest_detail: "Inserted 6 new row(s).",
    edgar: { fetched: 2, inserted: 1, skipped: 0, failed: 0, inserted_ids: ["id-e1"] },
    newsapi: { fetched: 10, inserted: 3, skipped: 0, failed: 0, inserted_ids: ["id-n1", "id-n2", "id-n3"] },
    gnews: { fetched: 2, inserted: 0, skipped: 2, failed: 0, inserted_ids: [] },
    finnhub: { fetched: 3, inserted: 2, skipped: 0, failed: 0, inserted_ids: ["id-f1", "id-f2"] },
    total_inserted: 6,
    inserted_article_ids: ["id-e1", "id-n1", "id-n2", "id-n3", "id-f1", "id-f2"],
    ...overrides,
  };
}

function makeRequest(secret?: string, body?: unknown): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/news/cron", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/news/cron", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockIngestNewsToSupabase.mockReset();
    mockRunAnalysis.mockReset().mockResolvedValue({
      runId: "run-1",
      error: null,
      meta: { feedItemsCreated: 2 },
    });
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    mockSupabase = buildMockSupabase([{ id: "p1", user_id: "u1" }]);
    process.env.CRON_SECRET = "test-secret";
  });

  it("rejects missing secret", async () => {
    const res = await POST(makeRequest(undefined, makePayload()));
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    const res = await POST(makeRequest("test-secret", { nope: true }));
    expect(res.status).toBe(400);
  });

  it("finalizes ingest payload, enriches explicit article ids, and runs analysis", async () => {
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 6, skipped: 0 });

    const res = await POST(makeRequest("test-secret", makePayload()));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockIngestNewsToSupabase).toHaveBeenCalledWith(mockSupabase, {
      articleIds: ["id-e1", "id-f1", "id-f2", "id-n1", "id-n2", "id-n3"],
    });
    expect(mockRunAnalysis).toHaveBeenCalledWith(mockSupabase, "p1");
    expect(body.totalInserted).toBe(6);
    expect(body.ingestBreakdown.finnhub.inserted).toBe(2);
    expect(body.analysis.portfoliosProcessed).toBe(1);
    expect(body.insertedArticleIds).toEqual(["id-e1", "id-f1", "id-f2", "id-n1", "id-n2", "id-n3"]);
  });

  it("skips enrichment when no inserted article ids are provided", async () => {
    const payload = makePayload({
      total_inserted: 0,
      inserted_article_ids: [],
      edgar: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      newsapi: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      gnews: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      finnhub: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
    });

    const res = await POST(makeRequest("test-secret", payload));
    const body = await res.json();

    expect(mockIngestNewsToSupabase).not.toHaveBeenCalled();
    expect(body.enriched).toBe(0);
  });

  it("skips analysis for recently analyzed portfolios", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = {
      ...buildMockSupabase([{ id: "p1", user_id: "u1" }]),
      from: ((table: string) => {
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
      }) as typeof mockSupabase.from,
    };
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 1, skipped: 0 });

    const res = await POST(makeRequest("test-secret", makePayload()));
    const body = await res.json();

    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(body.analysis.portfoliosSkipped).toBe(1);
  });
});

describe("GET /api/news/cron", () => {
  it("returns a usage error because POST is the production entrypoint", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

