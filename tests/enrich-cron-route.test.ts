import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIngestNewsToSupabase,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockIngestNewsToSupabase: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({}),
}));

vi.mock("@/lib/security/timing", () => ({
  isTimingSafeEqual: (a: string, b: string) => a === b,
}));

vi.mock("@/lib/services/news", () => ({
  ingestNewsToSupabase: (...args: unknown[]) => mockIngestNewsToSupabase(...args),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

import { POST } from "@/app/api/news/cron/enrich/route";

function makeRequest(secret?: string, body?: unknown): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/news/cron/enrich", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/news/cron/enrich", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockIngestNewsToSupabase.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    process.env.CRON_SECRET = "test-secret";
  });

  it("rejects missing secret", async () => {
    const res = await POST(makeRequest(undefined, { articleIds: ["a"] }));
    expect(res.status).toBe(401);
  });

  it("rejects missing body", async () => {
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(400);
  });

  it("rejects body without articleIds array", async () => {
    const res = await POST(makeRequest("test-secret", { nope: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("articleIds");
  });

  it("rejects empty articleIds", async () => {
    const res = await POST(makeRequest("test-secret", { articleIds: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects more than 10 IDs", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `id-${i}`);
    const res = await POST(makeRequest("test-secret", { articleIds: ids }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("max batch size");
  });

  it("calls ingestNewsToSupabase with exactly the provided batch", async () => {
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 3, skipped: 0 });

    const ids = ["id-a", "id-b", "id-c"];
    const res = await POST(makeRequest("test-secret", { articleIds: ids }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockIngestNewsToSupabase).toHaveBeenCalledOnce();
    expect(mockIngestNewsToSupabase).toHaveBeenCalledWith(
      expect.anything(),
      { articleIds: ["id-a", "id-b", "id-c"] },
    );
    expect(body.requested).toBe(3);
    expect(body.enriched).toBe(3);
    expect(body.error).toBeNull();
  });

  it("returns 5xx when enrichment returns error", async () => {
    mockIngestNewsToSupabase.mockResolvedValue({
      enriched: 0,
      skipped: 0,
      error: "AI provider unavailable",
    });

    const res = await POST(makeRequest("test-secret", { articleIds: ["id-x"] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("AI provider unavailable");
  });

  it("accepts exactly 10 IDs at the boundary", async () => {
    mockIngestNewsToSupabase.mockResolvedValue({ enriched: 10, skipped: 0 });

    const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    const res = await POST(makeRequest("test-secret", { articleIds: ids }));
    expect(res.status).toBe(200);
  });
});
