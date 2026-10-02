import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit J5 (application side). The atomic claim itself is proven against Postgres with two real
// sessions in supabase/tests/037_notification_delivery_claims.test.sql. No message is ever sent:
// the provider adapters are mocked.

const currentSupabase = vi.hoisted(() => ({ value: null as unknown }));
const sendDigestSmsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => currentSupabase.value }));
vi.mock("@/lib/notifications/delivery", () => ({
  sendDigestEmail: vi.fn(),
  sendDigestSms: (...args: unknown[]) => sendDigestSmsMock(...args),
}));

import { createMockServiceSupabase } from "@/tests/helpers/mock-service-supabase";
import { runDailyDigestCron } from "@/lib/notifications/daily-digest";

const NOW = new Date("2026-01-15T14:00:00.000Z");

function setup() {
  const supabase = createMockServiceSupabase({
    db: {
      verified_phone_numbers: [{ user_id: "user-1", phone_number: "+14165551234" }],
      user_notification_preferences: [
        { user_id: "user-1", email_digest_enabled: false, sms_digest_enabled: true, phone_number: "+14165551234" },
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
          summary_line: "Bullish leaders: AAPL.",
          bullish_symbols: ["AAPL"],
          bearish_symbols: [],
          top_stories: [],
        },
      ],
    },
  });
  currentSupabase.value = supabase;
  return supabase;
}

const sms = (status: string, extra: Record<string, unknown> = {}) => ({
  channel: "sms",
  status,
  digestId: "digest-1",
  providerMessageId: null,
  errorText: null,
  ...extra,
});

const run = () => runDailyDigestCron({ now: NOW, request: new Request("https://pulsefolio.example/api/x") });

describe("digest delivery claims (J5)", () => {
  beforeEach(() => {
    sendDigestSmsMock.mockReset();
    process.env.APP_BASE_URL = "https://pulsefolio.example";
  });

  it("concurrent cron runs invoke the SMS provider once", async () => {
    setup();
    let release: () => void = () => {};
    sendDigestSmsMock.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve(sms("sent", { providerMessageId: "SM1" }));
      }),
    );

    const first = run();
    const second = run();
    await vi.waitFor(() => expect(sendDigestSmsMock).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);

    expect(sendDigestSmsMock).toHaveBeenCalledTimes(1);
  });

  it("retries a confirmed rejection (e.g. 429) on the next run", async () => {
    const supabase = setup();
    sendDigestSmsMock.mockResolvedValueOnce(sms("failed", { errorText: "Too Many Requests" }));
    await run();
    expect(supabase.__db.notification_deliveries[0]).toMatchObject({ status: "failed", attempt_count: 1 });

    sendDigestSmsMock.mockResolvedValueOnce(sms("sent", { providerMessageId: "SM2" }));
    await run();
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(2);
    expect(supabase.__db.notification_deliveries[0]).toMatchObject({ status: "sent", attempt_count: 2 });
  });

  it("never resends after an ambiguous result (timeout or provider 5xx)", async () => {
    const supabase = setup();
    sendDigestSmsMock.mockResolvedValueOnce(sms("uncertain", { errorText: "timeout" }));
    await run();
    await run();
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(1);
    expect(supabase.__db.notification_deliveries[0].status).toBe("uncertain");
  });

  it("stops retrying confirmed rejections after the attempt cap", async () => {
    setup();
    sendDigestSmsMock.mockResolvedValue(sms("failed", { errorText: "Too Many Requests" }));
    for (let i = 0; i < 5; i += 1) await run();
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(3);
  });
});
