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

import { GET, POST } from "@/app/api/news/cron/route";

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
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
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

  it("returns insertedArticleIds sorted and shouldEnrich true when articles present", async () => {
    const res = await POST(makeRequest("test-secret", makePayload()));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.insertedArticleIds).toEqual(["id-e1", "id-f1", "id-f2", "id-n1", "id-n2", "id-n3"]);
    expect(body.shouldEnrich).toBe(true);
    expect(body.totalInserted).toBe(6);
    expect(body.ingestBreakdown.finnhub.inserted).toBe(2);
  });

  it("does not call runAnalysis", async () => {
    const res = await POST(makeRequest("test-secret", makePayload()));
    const body = await res.json();

    // The response should NOT contain an analysis field
    expect(body.analysis).toBeUndefined();
  });

  it("returns shouldEnrich false when no inserted article ids", async () => {
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

    expect(body.shouldEnrich).toBe(false);
    expect(body.insertedArticleIds).toEqual([]);
  });

  it("deduplicates and sorts article IDs", async () => {
    const payload = makePayload({
      inserted_article_ids: ["zz", "aa", "zz", "bb", " aa "],
    });

    const res = await POST(makeRequest("test-secret", payload));
    const body = await res.json();

    expect(body.insertedArticleIds).toEqual(["aa", "bb", "zz"]);
  });
});

describe("GET /api/news/cron", () => {
  it("returns a usage error because POST is the production entrypoint", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
