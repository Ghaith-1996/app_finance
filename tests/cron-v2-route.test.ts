import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

import { GET, POST } from "@/app/api/news/cron/v2/route";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    tickers: ["AAPL", "TSLA"],
    lookbackHours: 24,
    maxArticles: 50,
    providerSet: "candidate",
    ingest_status: "success",
    ingest_detail: "Inserted 8 new row(s).",
    edgar: { fetched: 2, inserted: 1, skipped: 0, failed: 0, inserted_ids: ["id-e1"] },
    newsapi_ai: { fetched: 10, inserted: 3, skipped: 0, failed: 0, inserted_ids: ["id-ai1", "id-ai2", "id-ai3"] },
    gnews: { fetched: 5, inserted: 2, skipped: 1, failed: 0, inserted_ids: ["id-g1", "id-g2"] },
    newscatcher: { fetched: 4, inserted: 2, skipped: 0, failed: 0, inserted_ids: ["id-nc1", "id-nc2"] },
    total_inserted: 8,
    inserted_article_ids: ["id-e1", "id-ai1", "id-ai2", "id-ai3", "id-g1", "id-g2", "id-nc1", "id-nc2"],
    ...overrides,
  };
}

function makeRequest(secret?: string, body?: unknown): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/news/cron/v2", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/news/cron/v2", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    process.env.NEWS_V2_CRON_SECRET = "v2-secret";
  });

  it("returns 500 when NEWS_V2_CRON_SECRET is not configured", async () => {
    delete process.env.NEWS_V2_CRON_SECRET;
    const res = await POST(makeRequest("some-secret", makePayload()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/NEWS_V2_CRON_SECRET/);
  });

  it("rejects missing auth", async () => {
    const res = await POST(makeRequest(undefined, makePayload()));
    expect(res.status).toBe(401);
  });

  it("rejects wrong secret", async () => {
    const res = await POST(makeRequest("wrong-secret", makePayload()));
    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON body", async () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Authorization", "Bearer v2-secret");
    const req = new Request("http://localhost/api/news/cron/v2", {
      method: "POST",
      headers,
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/);
  });

  it("rejects payload missing candidate source rows", async () => {
    const payload = makePayload();
    delete (payload as Record<string, unknown>).newscatcher;
    const res = await POST(makeRequest("v2-secret", payload));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid candidate cron payload/);
  });

  it("rejects payload with invalid tickers", async () => {
    const payload = makePayload({ tickers: ["AAPL", "INVALID TICKER!!"] });
    const res = await POST(makeRequest("v2-secret", payload));
    expect(res.status).toBe(400);
  });

  it("rejects payload with out-of-range lookbackHours", async () => {
    const res = await POST(makeRequest("v2-secret", makePayload({ lookbackHours: 999 })));
    expect(res.status).toBe(400);
  });

  it("rejects payload with out-of-range maxArticles", async () => {
    const res = await POST(makeRequest("v2-secret", makePayload({ maxArticles: 0 })));
    expect(res.status).toBe(400);
  });

  it("returns providerSet=candidate and insertedArticleIds sorted on valid payload", async () => {
    const res = await POST(makeRequest("v2-secret", makePayload()));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.providerSet).toBe("candidate");
    expect(body.tickerCount).toBe(2);
    expect(body.tickers).toBeUndefined();
    expect(body.insertedArticleIds).toEqual([
      "id-ai1", "id-ai2", "id-ai3", "id-e1", "id-g1", "id-g2", "id-nc1", "id-nc2",
    ]);
    expect(body.shouldEnrich).toBe(true);
    expect(body.totalInserted).toBe(8);
  });

  it("returns ingest breakdown with all four candidate sources", async () => {
    const res = await POST(makeRequest("v2-secret", makePayload()));
    const body = await res.json();

    expect(body.ingestBreakdown.edgar.inserted).toBe(1);
    expect(body.ingestBreakdown.newsapi_ai.inserted).toBe(3);
    expect(body.ingestBreakdown.gnews.inserted).toBe(2);
    expect(body.ingestBreakdown.newscatcher.inserted).toBe(2);
    expect(body.ingestBreakdown.total_inserted).toBe(8);
  });

  it("deduplicates and sorts article IDs", async () => {
    const payload = makePayload({
      inserted_article_ids: ["zz", "aa", "zz", "bb", " aa "],
    });
    const res = await POST(makeRequest("v2-secret", payload));
    const body = await res.json();

    expect(body.insertedArticleIds).toEqual(["aa", "bb", "zz"]);
  });

  it("returns shouldEnrich false when no articles inserted", async () => {
    const payload = makePayload({
      total_inserted: 0,
      inserted_article_ids: [],
      edgar: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      newsapi_ai: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      gnews: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
      newscatcher: { fetched: 0, inserted: 0, skipped: 0, failed: 0, inserted_ids: [] },
    });
    const res = await POST(makeRequest("v2-secret", payload));
    const body = await res.json();

    expect(body.shouldEnrich).toBe(false);
    expect(body.insertedArticleIds).toEqual([]);
  });

  it("logs cron finalize start and completion", async () => {
    await POST(makeRequest("v2-secret", makePayload()));

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Candidate cron finalize started",
      expect.objectContaining({ tickers: 2, totalInserted: 8 }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Candidate cron finalize completed",
      expect.objectContaining({
        inserted: expect.objectContaining({
          edgar: 1,
          newsapi_ai: 3,
          gnews: 2,
          newscatcher: 2,
          total: 8,
        }),
      }),
    );
  });
});

describe("GET /api/news/cron/v2", () => {
  it("returns 405 directing to POST", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toMatch(/POST/);
  });
});
