import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunAnalysis,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockRunAnalysis: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

let mockSupabase: ReturnType<typeof buildMockSupabase>;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

vi.mock("@/lib/security/timing", () => ({
  isTimingSafeEqual: (a: string, b: string) => a === b,
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

import { GET, POST } from "@/app/api/analysis/cron/route";

function buildMockSupabase({
  portfolios = [],
  latestRunsByPortfolio = {},
  latestRunStartsByPortfolio = {},
  newestEnrichedAt = new Date().toISOString(),
  newestFailedAt = null,
}: {
  portfolios?: Array<{ id: string; user_id: string }>;
  latestRunsByPortfolio?: Record<string, string | null | undefined>;
  latestRunStartsByPortfolio?: Record<string, string>;
  newestEnrichedAt?: string | null;
  /** Settle time of the newest article whose enrichment terminally failed. */
  newestFailedAt?: string | null;
} = {}) {
  return {
    from: (table: string) => {
      if (table === "portfolios") {
        return {
          select: () => ({
            order: () => ({
              range: (from: number, to: number) =>
                Promise.resolve({ data: portfolios.slice(from, to + 1), error: null }),
            }),
            eq: (_column: string, value: string) => ({
              maybeSingle: () =>
                Promise.resolve({ data: portfolios.find((row) => row.id === value) ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "news_items") {
        // Honour the enrichment_status filter so the test proves which states form the watermark.
        let statuses: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            if (column === "enrichment_status") statuses = [value];
            return chain;
          },
          in: (column: string, values: string[]) => {
            if (column === "enrichment_status") statuses = values;
            return chain;
          },
          not: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => {
            const candidates = [
              statuses.includes("succeeded") ? newestEnrichedAt : null,
              statuses.includes("failed") ? newestFailedAt : null,
            ].filter((value): value is string => !!value);
            const newest = candidates.sort().at(-1);
            return Promise.resolve({ data: newest ? { enriched_at: newest } : null, error: null });
          },
        };
        return { select: () => chain };
      }
      if (table === "analysis_runs") {
        let selectedPortfolioId: string | null = null;
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              if (column === "portfolio_id") {
                selectedPortfolioId = value;
              }
              return {
                in: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => {
                        const hasLatestRun = selectedPortfolioId !== null
                          && Object.prototype.hasOwnProperty.call(latestRunsByPortfolio, selectedPortfolioId);
                        const completedAt = hasLatestRun && selectedPortfolioId
                          ? latestRunsByPortfolio[selectedPortfolioId]
                          : null;
                        return Promise.resolve({
                          data: completedAt
                            ? {
                                completed_at: completedAt,
                                started_at: latestRunStartsByPortfolio[selectedPortfolioId!] ?? null,
                              }
                            : null,
                          error: null,
                        });
                      },
                    }),
                  }),
                }),
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeGetRequest(secret?: string, opts?: { force?: boolean }): Request {
  const headers = new Headers();
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  const qs = opts?.force ? "?force=true" : "";
  return new Request(`http://localhost/api/analysis/cron${qs}`, {
    method: "GET",
    headers,
  });
}

function makePostRequest(secret?: string, body?: unknown): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/analysis/cron", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockRunAnalysis.mockReset().mockResolvedValue({
    runId: "run-1",
    error: null,
    meta: { feedItemsCreated: 2 },
  });
  mockLoggerInfo.mockReset();
  mockLoggerWarn.mockReset();
  mockLoggerError.mockReset();
  mockSupabase = buildMockSupabase({
    portfolios: [{ id: "p1", user_id: "u1" }],
  });
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/analysis/cron", () => {
  it("rejects bad secret", async () => {
    const res = await GET(makeGetRequest(undefined));
    expect(res.status).toBe(401);
  });

  it("returns only eligible portfolio ids and skippedCount", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = buildMockSupabase({
      portfolios: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
        { id: "p3", user_id: "u3" },
      ],
      latestRunsByPortfolio: {
        p1: null,
        p2: recentlyCompleted,
      },
    });

    const res = await GET(makeGetRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.portfolioIds).toEqual(["p1", "p3"]);
    expect(body.skippedCount).toBe(1);
    expect(mockRunAnalysis).not.toHaveBeenCalled();
  });

  it("returns all portfolios when force=true, ignoring cooldown", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = buildMockSupabase({
      portfolios: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
      ],
      latestRunsByPortfolio: {
        p1: recentlyCompleted,
        p2: recentlyCompleted,
      },
    });

    const res = await GET(makeGetRequest("test-secret", { force: true }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.portfolioIds).toEqual(["p1", "p2"]);
    expect(body.skippedCount).toBe(0);
  });

  describe("J1: eligibility follows durable work, not new inserts", () => {
    const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const halfHourAgo = () => new Date(Date.now() - 30 * 60 * 1000).toISOString();

    it("skips portfolios whose last usable run already covers the newest enriched article", async () => {
      mockSupabase = buildMockSupabase({
        portfolios: [{ id: "p1", user_id: "u1" }],
        latestRunsByPortfolio: { p1: halfHourAgo() },
        newestEnrichedAt: hourAgo(),
      });
      const body = await (await GET(makeGetRequest("test-secret"))).json();
      expect(body.portfolioIds).toEqual([]);
      expect(body.upToDateCount).toBe(1);
    });

    it("selects portfolios when articles were enriched after their last usable run (e.g. backlog recovered, or the last run failed)", async () => {
      mockSupabase = buildMockSupabase({
        portfolios: [{ id: "p1", user_id: "u1" }, { id: "p2", user_id: "u2" }],
        latestRunsByPortfolio: { p1: hourAgo(), p2: halfHourAgo() },
        newestEnrichedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      });
      const body = await (await GET(makeGetRequest("test-secret"))).json();
      expect(body.portfolioIds).toEqual(["p1"]);
    });

    it("R7: an article enriched while the last run was in progress is analysed next time", async () => {
      // The run read the pool at its start (60 min ago), the article was enriched 55 min ago and the
      // run ended 50 min ago: the run never saw the article.
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
      mockSupabase = buildMockSupabase({
        portfolios: [{ id: "p1", user_id: "u1" }],
        latestRunsByPortfolio: { p1: minutesAgo(50) },
        latestRunStartsByPortfolio: { p1: minutesAgo(60) },
        newestEnrichedAt: minutesAgo(55),
      });
      const body = await (await GET(makeGetRequest("test-secret"))).json();
      expect(body.portfolioIds).toEqual(["p1"]);
      expect(body.upToDateCount).toBe(0);
    });

    it("P1: an article whose enrichment terminally failed after the last run is analysed next time", async () => {
      // No article succeeded since the last run (provider outage), but one exhausted its retries
      // and now carries fallback text that runAnalysis can still match.
      mockSupabase = buildMockSupabase({
        portfolios: [{ id: "p1", user_id: "u1" }],
        latestRunsByPortfolio: { p1: hourAgo() },
        newestEnrichedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        newestFailedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      });
      const body = await (await GET(makeGetRequest("test-secret"))).json();
      expect(body.portfolioIds).toEqual(["p1"]);
      expect(body.upToDateCount).toBe(0);
    });

    it("always selects portfolios that never produced a usable run", async () => {
      mockSupabase = buildMockSupabase({
        portfolios: [{ id: "p1", user_id: "u1" }],
        latestRunsByPortfolio: {},
        newestEnrichedAt: null,
      });
      const body = await (await GET(makeGetRequest("test-secret"))).json();
      expect(body.portfolioIds).toEqual(["p1"]);
    });

    it("reads every portfolio page", async () => {
      const many = Array.from({ length: 2_350 }, (_, index) => ({ id: `p${index}`, user_id: "u" }));
      mockSupabase = buildMockSupabase({ portfolios: many });
      const body = await (await GET(makeGetRequest("test-secret", { force: true }))).json();
      expect(body.portfolioIds).toHaveLength(2_350);
    });
  });
});

describe("POST /api/analysis/cron", () => {
  it("rejects bad secret", async () => {
    const res = await POST(makePostRequest(undefined, { portfolioId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("rejects missing portfolioId", async () => {
    const res = await POST(makePostRequest("test-secret", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("portfolioId required");
  });

  it("returns 404 when portfolio is not found", async () => {
    mockSupabase = buildMockSupabase({ portfolios: [] });

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Portfolio not found");
  });

  it("skips a portfolio still in cooldown", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = buildMockSupabase({
      portfolios: [{ id: "p1", user_id: "u1" }],
      latestRunsByPortfolio: { p1: recentlyCompleted },
    });

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(body).toEqual({
      portfolioId: "p1",
      skipped: true,
      runId: null,
      error: null,
      meta: null,
    });
  });

  it("bypasses cooldown when force=true", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = buildMockSupabase({
      portfolios: [{ id: "p1", user_id: "u1" }],
      latestRunsByPortfolio: { p1: recentlyCompleted },
    });

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1", force: true }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockRunAnalysis).toHaveBeenCalledWith(mockSupabase, "p1");
    expect(body.skipped).toBe(false);
    expect(body.runId).toBe("run-1");
  });

  it("returns 200 with error when runAnalysis returns an error result", async () => {
    mockRunAnalysis.mockResolvedValue({
      runId: "run-1",
      error: "analysis failed internally",
      meta: null,
    });

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      portfolioId: "p1",
      skipped: false,
      runId: "run-1",
      error: "analysis failed internally",
      code: null,
      meta: null,
    });
  });

  it("skips when runAnalysis reports an in-progress run", async () => {
    mockRunAnalysis.mockResolvedValue({
      runId: null,
      error: "An analysis run is already in progress for this portfolio.",
      code: "analysis_already_running",
      meta: null,
    });

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      portfolioId: "p1",
      skipped: true,
      runId: null,
      error: null,
      code: "analysis_already_running",
      meta: null,
    });
  });

  it("returns 200 with error when runAnalysis throws", async () => {
    mockRunAnalysis.mockRejectedValue(new Error("AI quota exceeded"));

    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      portfolioId: "p1",
      skipped: false,
      runId: null,
      error: "AI quota exceeded",
      meta: null,
    });
  });
});
