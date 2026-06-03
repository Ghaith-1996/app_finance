import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunSmartAlertsCron,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockRunSmartAlertsCron: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/notifications/smart-alerts", () => ({
  runSmartAlertsCron: (...args: unknown[]) => mockRunSmartAlertsCron(...args),
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

function makeRequest(secret?: string) {
  const headers = new Headers();
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request(
    "http://localhost/api/notifications/smart-alerts/cron?now=2026-05-31T14:00:00.000Z",
    {
      method: "POST",
      headers,
    },
  );
}

describe("POST /api/notifications/smart-alerts/cron", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SMART_ALERTS_CRON_SECRET = "smart-secret";
    delete process.env.CRON_SECRET;
    mockRunSmartAlertsCron.mockResolvedValue({
      ran: true,
      triggeredAt: "2026-05-31T14:00:00.000Z",
      usersScanned: 1,
      portfoliosScanned: 1,
      alertsGenerated: 2,
      errors: [],
    });
  });

  it("rejects invalid cron auth", async () => {
    const { POST } = await import("@/app/api/notifications/smart-alerts/cron/route");

    const response = await POST(makeRequest("wrong"));

    expect(response.status).toBe(401);
    expect(mockRunSmartAlertsCron).not.toHaveBeenCalled();
  });

  it("runs the smart alert cron with an optional now override", async () => {
    const { POST } = await import("@/app/api/notifications/smart-alerts/cron/route");

    const response = await POST(makeRequest("smart-secret"));

    expect(response.status).toBe(200);
    expect(mockRunSmartAlertsCron).toHaveBeenCalledWith({
      now: new Date("2026-05-31T14:00:00.000Z"),
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        alertsGenerated: 2,
      }),
    );
  });

  it("returns 500 when user-level alert generation reports errors", async () => {
    mockRunSmartAlertsCron.mockResolvedValueOnce({
      ran: true,
      triggeredAt: "2026-05-31T14:00:00.000Z",
      usersScanned: 1,
      portfoliosScanned: 0,
      alertsGenerated: 0,
      errors: [{ userId: "user-1", message: "db failed" }],
    });
    const { POST } = await import("@/app/api/notifications/smart-alerts/cron/route");

    const response = await POST(makeRequest("smart-secret"));

    expect(response.status).toBe(500);
  });
});

describe("GET /api/notifications/smart-alerts/cron", () => {
  it("directs callers to POST", async () => {
    const { GET } = await import("@/app/api/notifications/smart-alerts/cron/route");
    const response = await GET();
    expect(response.status).toBe(405);
  });
});
