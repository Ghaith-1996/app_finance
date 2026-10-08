import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateServiceClient,
  mockSyncTrackedEarningsReports,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCreateServiceClient: vi.fn(),
  mockSyncTrackedEarningsReports: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

vi.mock("@/lib/services/earnings-reports", () => ({
  syncTrackedEarningsReports: (...args: unknown[]) => mockSyncTrackedEarningsReports(...args),
}));

vi.mock("@/lib/security/timing", () => ({
  isTimingSafeEqual: (left: string, right: string) => left === right,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    error: mockLoggerError,
  }),
}));

import { POST } from "@/app/api/earnings-reports/cron/route";

function makeRequest(secret?: string) {
  const headers = new Headers();
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("http://localhost/api/earnings-reports/cron", {
    method: "POST",
    headers,
  });
}

describe("POST /api/earnings-reports/cron", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCreateServiceClient.mockReset().mockReturnValue({ kind: "service-client" });
    mockSyncTrackedEarningsReports.mockReset().mockResolvedValue({
      processed: 3,
      resolved: 2,
      companyLinks: 1,
      secFallbacks: 1,
      missing: 1,
      inactivated: 2,
      failed: 0,
      stale: 0,
    });
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();
    process.env.CRON_SECRET = "test-secret";
  });

  it("rejects missing auth", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });

  it("returns sync counts and keeps partial misses non-fatal", async () => {
    const response = await POST(makeRequest("test-secret"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      processed: 3,
      resolved: 2,
      companyLinks: 1,
      secFallbacks: 1,
      missing: 1,
      inactivated: 2,
      failed: 0,
      stale: 0,
      partial: false,
    });
    expect(mockSyncTrackedEarningsReports).toHaveBeenCalledWith({ kind: "service-client" });
  });

  it("reports partial provider failure and returns 502 when every lookup failed (J6)", async () => {
    mockSyncTrackedEarningsReports.mockResolvedValueOnce({
      processed: 2, resolved: 0, companyLinks: 0, secFallbacks: 0, missing: 0, inactivated: 0, failed: 2, stale: 2,
    });
    const response = await POST(makeRequest("test-secret"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ failed: 2, stale: 2, partial: true });
  });

  it("returns 500 when the sync service throws", async () => {
    mockSyncTrackedEarningsReports.mockRejectedValueOnce(new Error("db unavailable"));

    const response = await POST(makeRequest("test-secret"));
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe("Earnings report sync failed");
    expect(body.detail).toBe("db unavailable");
  });
});
