import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveGlobalTickers = vi.fn();
const mockRunPythonWorker = vi.fn();
const mockIngestNewsToSupabase = vi.fn();
const mockExtractPublisherContent = vi.fn();

const ORIGINAL_ADMIN_USER_IDS = process.env.ADMIN_USER_IDS;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => "service-mock",
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

const supabaseMock = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock,
}));

import { POST } from "@/app/api/news/ingest/route";

describe("POST /api/news/ingest", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = "user-1";
    supabaseMock.auth.getUser.mockReset();
    mockResolveGlobalTickers.mockReset();
    mockRunPythonWorker.mockReset();
    mockIngestNewsToSupabase.mockReset();
    mockExtractPublisherContent.mockReset();

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
      error: null,
    });
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"], error: null });
    mockRunPythonWorker.mockResolvedValue({
      edgar: { inserted_ids: [] },
      newsapi: { inserted_ids: ["article-1"] },
      gnews: { inserted_ids: [] },
      total_inserted: 1,
      ingest_status: "success",
      ingest_detail: "ok",
      error: null,
    });
    mockExtractPublisherContent.mockResolvedValue({
      queued: 1,
      attempted: 1,
      extracted: 0,
      skipped: 0,
      failed: 0,
      skippedMissingUrl: 0,
      skippedUnsupportedSource: 0,
      skippedAlreadyExtracted: 0,
      skippedUnsupportedUrl: 0,
      errors: [],
      background: true,
      processedArticleIds: ["article-1"],
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 1, skipped: 0, error: null });
  });

  afterAll(() => {
    process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_USER_IDS;
  });

  it("returns 401 when unauthenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/news/ingest", { method: "POST" }));

    expect(res.status).toBe(401);
    expect(mockResolveGlobalTickers).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin callers", async () => {
    process.env.ADMIN_USER_IDS = "different-user";

    const res = await POST(new Request("http://localhost/api/news/ingest", { method: "POST" }));

    expect(res.status).toBe(403);
    expect(mockResolveGlobalTickers).not.toHaveBeenCalled();
  });

  it("preserves the successful response for allowlisted admins", async () => {
    const res = await POST(
      new Request("http://localhost/api/news/ingest", {
        method: "POST",
        body: JSON.stringify({ lookbackHours: 12, maxArticles: 5 }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockResolveGlobalTickers).toHaveBeenCalledWith("service-mock");
    expect(mockRunPythonWorker).toHaveBeenCalledWith(["AAPL"], 12, 5);
    expect(body.totalInserted).toBe(1);
    expect(body.extractionQueued).toBe(1);
  });
});
