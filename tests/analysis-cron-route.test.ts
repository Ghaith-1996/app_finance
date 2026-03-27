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
}: {
  portfolios?: Array<{ id: string; user_id: string }>;
  latestRunsByPortfolio?: Record<string, string | null | undefined>;
} = {}) {
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
        let selectedPortfolioId: string | null = null;
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              if (column === "portfolio_id") {
                selectedPortfolioId = value;
              }
              return {
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => {
                        const hasLatestRun = selectedPortfolioId !== null
                          && Object.prototype.hasOwnProperty.call(latestRunsByPortfolio, selectedPortfolioId);
                        const completedAt = hasLatestRun && selectedPortfolioId
                          ? latestRunsByPortfolio[selectedPortfolioId]
                          : null;
                        return Promise.resolve({
                          data: completedAt ? { completed_at: completedAt } : null,
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

  it("processes a single eligible portfolio", async () => {
    const res = await POST(makePostRequest("test-secret", { portfolioId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockRunAnalysis).toHaveBeenCalledWith(mockSupabase, "p1");
    expect(body.portfolioId).toBe("p1");
    expect(body.skipped).toBe(false);
    expect(body.runId).toBe("run-1");
    expect(body.error).toBe(null);
    expect(body.meta?.feedItemsCreated).toBe(2);
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
