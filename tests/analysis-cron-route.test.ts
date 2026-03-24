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

import { POST } from "@/app/api/analysis/cron/route";

function buildMockSupabase(
  portfolios: Array<{ id: string; user_id: string }> = [],
  latestRunCompletedAt: string | null = null,
) {
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
                    maybeSingle: () => Promise.resolve({
                      data: latestRunCompletedAt
                        ? { completed_at: latestRunCompletedAt }
                        : null,
                      error: null,
                    }),
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
  return new Request("http://localhost/api/analysis/cron", {
    method: "POST",
    headers,
  });
}

describe("POST /api/analysis/cron", () => {
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
    mockSupabase = buildMockSupabase([{ id: "p1", user_id: "u1" }]);
    process.env.CRON_SECRET = "test-secret";
  });

  it("rejects missing secret", async () => {
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(401);
  });

  it("skips recently analyzed portfolios", async () => {
    const recentlyCompleted = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSupabase = buildMockSupabase(
      [{ id: "p1", user_id: "u1" }],
      recentlyCompleted,
    );

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(body.portfoliosSkipped).toBe(1);
    expect(body.portfoliosProcessed).toBe(0);
  });

  it("processes eligible portfolios", async () => {
    mockSupabase = buildMockSupabase([{ id: "p1", user_id: "u1" }], null);

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockRunAnalysis).toHaveBeenCalledWith(mockSupabase, "p1");
    expect(body.portfoliosProcessed).toBe(1);
    expect(body.portfoliosSkipped).toBe(0);
    expect(body.errors).toEqual([]);
  });

  it("includes error in response when a portfolio analysis throws", async () => {
    mockSupabase = buildMockSupabase(
      [{ id: "p1", user_id: "u1" }, { id: "p2", user_id: "u2" }],
      null,
    );
    mockRunAnalysis
      .mockRejectedValueOnce(new Error("AI quota exceeded"))
      .mockResolvedValueOnce({
        runId: "run-2",
        error: null,
        meta: { feedItemsCreated: 1 },
      });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // p1 errored, p2 succeeded
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].portfolioId).toBe("p1");
    expect(body.errors[0].error).toBe("AI quota exceeded");
    expect(body.portfoliosProcessed).toBe(1);
    // runAnalysis was called for both portfolios
    expect(mockRunAnalysis).toHaveBeenCalledTimes(2);
  });

  it("handles portfolio with error result from runAnalysis", async () => {
    mockRunAnalysis.mockResolvedValue({
      runId: "run-1",
      error: "analysis failed internally",
      meta: null,
    });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toBe("analysis failed internally");
    expect(body.portfoliosProcessed).toBe(0);
  });

  it("returns 200 even with empty portfolio list", async () => {
    mockSupabase = buildMockSupabase([], null);

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.portfoliosProcessed).toBe(0);
    expect(body.portfoliosSkipped).toBe(0);
    expect(body.errors).toEqual([]);
    expect(mockRunAnalysis).not.toHaveBeenCalled();
  });
});
