import { beforeEach, describe, expect, it, vi } from "vitest";

const recordPortfolioValueSnapshots = vi.fn();

vi.mock("@/lib/services/portfolio-value-snapshots", () => ({
  recordPortfolioValueSnapshots: (...args: unknown[]) => recordPortfolioValueSnapshots(...args),
}));

describe("POST /api/portfolio/value-snapshots/cron", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    delete process.env.PORTFOLIO_SNAPSHOT_CRON_SECRET;
    recordPortfolioValueSnapshots.mockResolvedValue({
      ran: true,
      bucketStart: "2026-05-12T13:00:00.000Z",
      capturedAt: "2026-05-12T13:05:00.000Z",
      portfoliosScanned: 2,
      portfoliosSnapshotted: 2,
      portfoliosSkipped: 0,
      holdingsUpdated: 4,
      quoteFetchError: null,
      errors: [],
    });
  });

  it("rejects missing or invalid cron auth", async () => {
    const { POST } = await import("@/app/api/portfolio/value-snapshots/cron/route");

    const response = await POST(
      new Request("http://localhost/api/portfolio/value-snapshots/cron", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(recordPortfolioValueSnapshots).not.toHaveBeenCalled();
  });

  it("records hourly portfolio value snapshots", async () => {
    const { POST } = await import("@/app/api/portfolio/value-snapshots/cron/route");
    const response = await POST(
      new Request(
        "http://localhost/api/portfolio/value-snapshots/cron?now=2026-05-12T13:05:00.000Z",
        {
          method: "POST",
          headers: { Authorization: "Bearer test-secret" },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(recordPortfolioValueSnapshots).toHaveBeenCalledWith({
      now: new Date("2026-05-12T13:05:00.000Z"),
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        portfoliosScanned: 2,
        portfoliosSnapshotted: 2,
        holdingsUpdated: 4,
      }),
    );
  });
});
