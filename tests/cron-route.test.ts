import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveGlobalTickers = vi.fn();
const mockRunPythonWorker = vi.fn();
const mockIngestNewsToSupabase = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => "mock-supabase",
}));

vi.mock("@/lib/services/ticker-resolver", () => ({
  resolveGlobalTickers: (...args: unknown[]) => mockResolveGlobalTickers(...args),
}));

vi.mock("@/lib/services/news/worker", () => ({
  runPythonWorker: (...args: unknown[]) => mockRunPythonWorker(...args),
}));

vi.mock("@/lib/services/news", () => ({
  ingestNewsToSupabase: (...args: unknown[]) => mockIngestNewsToSupabase(...args),
}));

import { POST } from "@/app/api/news/cron/route";

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

describe("POST /api/news/cron", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockResolveGlobalTickers.mockReset();
    mockRunPythonWorker.mockReset();
    mockIngestNewsToSupabase.mockReset();
    process.env.CRON_SECRET = "test-secret";
  });

  it("rejects missing secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invalid secret", async () => {
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("runs EDGAR + NewsAPI + GNews via a single worker call (no per-portfolio headline tickers)", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL", "MSFT"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: { ...emptyRow(), fetched: 2, inserted: 1 },
      newsapi: { ...emptyRow(), fetched: 10, inserted: 5 },
      gnews: { ...emptyRow(), fetched: 6, inserted: 2 },
      total_inserted: 8,
      ingest_status: "success",
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 8, skipped: 0 });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockRunPythonWorker).toHaveBeenCalledWith(["AAPL", "MSFT"], 24, 50);
    expect(body.totalInserted).toBe(8);
    expect(body.enriched).toBe(8);
    expect(body.ingestBreakdown.edgar.inserted).toBe(1);
    expect(body.ingestBreakdown.newsapi.inserted).toBe(5);
    expect(body.ingestBreakdown.gnews.inserted).toBe(2);
    expect(mockIngestNewsToSupabase).toHaveBeenCalledWith("mock-supabase", {
      sourceTypes: ["edgar", "newsapi", "gnews"],
      limit: 18,
    });
  });

  it("still runs global headline sources when no global tickers exist (EDGAR skipped inside worker)", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: [] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(),
      newsapi: { ...emptyRow(), fetched: 8, inserted: 4 },
      gnews: { ...emptyRow(), fetched: 5, inserted: 1 },
      total_inserted: 5,
      ingest_status: "success",
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 5, skipped: 0 });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    expect(mockRunPythonWorker).toHaveBeenCalledWith([], 24, 50);
    expect((await res.json()).totalInserted).toBe(5);
  });

  it("skips enrichment when no articles inserted", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(),
      newsapi: emptyRow(),
      gnews: emptyRow(),
      total_inserted: 0,
      ingest_status: "empty",
    });

    const res = await POST(makeRequest("test-secret"));
    expect((await res.json()).enriched).toBe(0);
    expect(mockIngestNewsToSupabase).not.toHaveBeenCalled();
  });

  it("returns 502 on worker subprocess failure", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["AAPL"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: emptyRow(),
      newsapi: emptyRow(),
      gnews: emptyRow(),
      total_inserted: 0,
      error: "spawn python ENOENT",
    });

    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(502);
  });

  it("ingestBreakdown includes gnews alongside the existing keys", async () => {
    mockResolveGlobalTickers.mockResolvedValue({ tickers: ["X"] });
    mockRunPythonWorker.mockResolvedValue({
      edgar: { ...emptyRow(), inserted: 1 },
      newsapi: { ...emptyRow(), inserted: 1 },
      gnews: { ...emptyRow(), inserted: 1 },
      total_inserted: 3,
      ingest_status: "success",
    });
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 3, skipped: 0 });

    const body = await (await POST(makeRequest("test-secret"))).json();
    expect(body.ingestBreakdown).toHaveProperty("edgar");
    expect(body.ingestBreakdown).toHaveProperty("newsapi");
    expect(body.ingestBreakdown).toHaveProperty("gnews");
    expect(body.ingestBreakdown).not.toHaveProperty("marketaux");
    expect(body.ingestBreakdown).not.toHaveProperty("yfinance");
  });
});
