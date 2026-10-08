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
});
