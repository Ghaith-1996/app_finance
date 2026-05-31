import { beforeEach, describe, expect, it, vi } from "vitest";

const currentSupabase = vi.hoisted(() => ({
  value: null as unknown,
}));
const sendDigestEmailMock = vi.hoisted(() => vi.fn());
const sendDigestSmsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => currentSupabase.value,
}));

vi.mock("@/lib/notifications/delivery", () => ({
  sendDigestEmail: (...args: unknown[]) => sendDigestEmailMock(...args),
  sendDigestSms: (...args: unknown[]) => sendDigestSmsMock(...args),
}));

import { createMockServiceSupabase } from "@/tests/helpers/mock-service-supabase";
import { POST } from "@/app/api/notifications/daily-digest/cron/route";

type MockServiceSupabase = ReturnType<typeof createMockServiceSupabase>;

function currentMockSupabase(): MockServiceSupabase {
  if (!currentSupabase.value) {
    throw new Error("Mock Supabase client was not initialized");
  }
  return currentSupabase.value as MockServiceSupabase;
}

function makeFeedRow(publishedAt: string) {
  return {
    id: "feed-1",
    analysis_run_id: "run-1",
    portfolio_id: "portfolio-1",
    relevance_score: 91,
    ai_summary: "Digest summary",
    why_it_matters: "Why it matters",
    matched_stock_tags: ["AAPL"],
    holdings: ["AAPL"],
    match_sources: ["portfolio"],
    display_effect: "bullish",
    news_items: {
      id: "news-1",
      headline: "Apple overnight move",
      source: "Wire",
      url: "https://example.com/story",
      published_at: publishedAt,
      category: "technology",
      ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
    },
  };
}

function makeRequest(now?: string, auth = true, origin = "https://pulsefolio.example") {
  const url = now
    ? `${origin}/api/notifications/daily-digest/cron?now=${encodeURIComponent(now)}`
    : `${origin}/api/notifications/daily-digest/cron`;
  const headers = new Headers();
  if (auth) {
    headers.set("Authorization", "Bearer test-digest-secret");
  }

  return new Request(url, {
    method: "POST",
    headers,
  });
}

describe("POST /api/notifications/daily-digest/cron", () => {
  beforeEach(() => {
    process.env.DIGEST_CRON_SECRET = "test-digest-secret";
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_TRUSTED_ORIGINS;
    sendDigestEmailMock.mockReset();
    sendDigestSmsMock.mockReset();
    sendDigestEmailMock.mockResolvedValue({
      channel: "email",
      status: "sent",
      digestId: "notification_digests-1",
      providerMessageId: "re_123",
      errorText: null,
    });
    sendDigestSmsMock.mockResolvedValue({
      channel: "sms",
      status: "sent",
      digestId: "notification_digests-1",
      providerMessageId: "SM123",
      errorText: null,
    });
  });

  it("rejects unauthorized cron requests", async () => {
    currentSupabase.value = createMockServiceSupabase({});

    const response = await POST(makeRequest(undefined, false));

    expect(response.status).toBe(401);
  });

  it("is idempotent across duplicate runs for the same ET morning", async () => {
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: true,
            sms_digest_enabled: true,
            phone_number: "+14165551234",
          },
        ],
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [
          {
            id: "run-1",
            portfolio_id: "portfolio-1",
            status: "complete",
            completed_at: "2026-01-15T13:58:00.000Z",
          },
        ],
        feed_items: [makeFeedRow("2026-01-14T22:30:00.000Z")],
      },
      users: {
        "user-1": { email: "user@example.com" },
      },
    });

    const first = await POST(makeRequest("2026-01-15T14:00:00.000Z"));
    const second = await POST(makeRequest("2026-01-15T14:15:00.000Z"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendDigestEmailMock).toHaveBeenCalledTimes(1);
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(1);

    const secondBody = await second.json();
    expect(secondBody.skippedDeliveries).toBe(2);
    expect(currentMockSupabase().__db.notification_deliveries).toHaveLength(2);
  });

  it("skips 13 UTC during standard time and runs once at 14 UTC", async () => {
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: true,
            sms_digest_enabled: false,
            phone_number: null,
          },
        ],
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [
          {
            id: "run-1",
            portfolio_id: "portfolio-1",
            status: "complete",
            completed_at: "2026-01-15T13:58:00.000Z",
          },
        ],
        feed_items: [makeFeedRow("2026-01-14T22:30:00.000Z")],
      },
      users: {
        "user-1": { email: "user@example.com" },
      },
    });

    const beforeWindow = await POST(makeRequest("2026-01-15T13:00:00.000Z"));
    const digestWindow = await POST(makeRequest("2026-01-15T14:00:00.000Z"));

    expect((await beforeWindow.json()).skipped).toBe(true);
    expect((await digestWindow.json()).ran).toBe(true);
    expect(sendDigestEmailMock).toHaveBeenCalledTimes(1);
  });

  it("runs at 13 UTC during daylight time and skips 14 UTC", async () => {
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: false,
            sms_digest_enabled: true,
            phone_number: "+14165551234",
          },
        ],
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [
          {
            id: "run-1",
            portfolio_id: "portfolio-1",
            status: "complete",
            completed_at: "2026-07-15T12:55:00.000Z",
          },
        ],
        feed_items: [makeFeedRow("2026-07-14T22:30:00.000Z")],
      },
    });

    const digestWindow = await POST(makeRequest("2026-07-15T13:00:00.000Z"));
    const afterWindow = await POST(makeRequest("2026-07-15T14:00:00.000Z"));

    expect((await digestWindow.json()).ran).toBe(true);
    expect((await afterWindow.json()).skipped).toBe(true);
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(1);
  });

  it("prefers APP_BASE_URL over the cron request host for digest links", async () => {
    process.env.APP_BASE_URL = "https://app.example.com/";
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: true,
            sms_digest_enabled: false,
            phone_number: null,
          },
        ],
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [
          {
            id: "run-1",
            portfolio_id: "portfolio-1",
            status: "complete",
            completed_at: "2026-01-15T13:58:00.000Z",
          },
        ],
        feed_items: [makeFeedRow("2026-01-14T22:30:00.000Z")],
      },
      users: {
        "user-1": { email: "user@example.com" },
      },
    });

    const response = await POST(
      makeRequest("2026-01-15T14:00:00.000Z", true, "https://raw-preview.vercel.app"),
    );

    expect(response.status).toBe(200);
    expect(sendDigestEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://app.example.com" }),
    );
  });

  it("falls back to a trusted request origin when no app URL env is configured", async () => {
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example.com";
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: true,
            sms_digest_enabled: false,
            phone_number: null,
          },
        ],
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [
          {
            id: "run-1",
            portfolio_id: "portfolio-1",
            status: "complete",
            completed_at: "2026-01-15T13:58:00.000Z",
          },
        ],
        feed_items: [makeFeedRow("2026-01-14T22:30:00.000Z")],
      },
      users: {
        "user-1": { email: "user@example.com" },
      },
    });

    const response = await POST(
      makeRequest("2026-01-15T14:00:00.000Z", true, "https://trusted.example.com"),
    );

    expect(response.status).toBe(200);
    expect(sendDigestEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://trusted.example.com" }),
    );
  });

  it("marks stale pending SMS deliveries as uncertain instead of resending them", async () => {
    currentSupabase.value = createMockServiceSupabase({
      db: {
        user_notification_preferences: [
          {
            user_id: "user-1",
            email_digest_enabled: false,
            sms_digest_enabled: true,
            phone_number: "+14165551234",
          },
        ],
        notification_digests: [
          {
            id: "digest-1",
            user_id: "user-1",
            digest_date: "2026-01-15",
            time_zone: "America/New_York",
            window_start: "2026-01-14T22:00:00.000Z",
            window_end: "2026-01-15T14:00:00.000Z",
            source_mode: "portfolio",
            portfolio_id: "portfolio-1",
            portfolio_name: "Main",
            summary_line: "Bullish leaders: AAPL. Bearish leaders: none.",
            bullish_symbols: ["AAPL"],
            bearish_symbols: [],
            top_stories: [],
          },
        ],
        notification_deliveries: [
          {
            id: "delivery-1",
            digest_id: "digest-1",
            channel: "sms",
            status: "pending",
            updated_at: new Date(Date.now() - 11 * 60_000).toISOString(),
          },
        ],
      },
    });

    const response = await POST(makeRequest("2026-01-15T14:00:00.000Z"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.uncertainDeliveries).toBe(1);
    expect(sendDigestSmsMock).not.toHaveBeenCalled();
    expect(currentMockSupabase().__db.notification_deliveries[0].status).toBe("uncertain");
  });
});
