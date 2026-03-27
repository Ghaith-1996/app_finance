import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConstructEvent = vi.fn();
const mockHasProcessedStripeEvent = vi.fn();
const mockInsertProcessedStripeEvent = vi.fn();
const mockSyncStripeCustomerRecord = vi.fn();
const mockSyncSubscriptionById = vi.fn();
const mockSyncSubscriptionFromStripeSubscription = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  }),
  requireStripeWebhookSecret: () => "whsec_test",
}));

vi.mock("@/lib/billing/store", () => ({
  hasProcessedStripeEvent: (...args: unknown[]) => mockHasProcessedStripeEvent(...args),
  insertProcessedStripeEvent: (...args: unknown[]) => mockInsertProcessedStripeEvent(...args),
}));

vi.mock("@/lib/billing/sync", () => ({
  syncStripeCustomerRecord: (...args: unknown[]) => mockSyncStripeCustomerRecord(...args),
  syncSubscriptionById: (...args: unknown[]) => mockSyncSubscriptionById(...args),
  syncSubscriptionFromStripeSubscription: (...args: unknown[]) =>
    mockSyncSubscriptionFromStripeSubscription(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ kind: "service-client" }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasProcessedStripeEvent.mockResolvedValue(false);
    mockInsertProcessedStripeEvent.mockResolvedValue(undefined);
    mockSyncStripeCustomerRecord.mockResolvedValue(undefined);
    mockSyncSubscriptionById.mockResolvedValue(undefined);
    mockSyncSubscriptionFromStripeSubscription.mockResolvedValue(undefined);
  });

  it("syncs checkout.session.completed events into billing state", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_123",
      type: "checkout.session.completed",
      created: 1,
      data: {
        object: {
          metadata: { user_id: "user-1" },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "sig",
      },
      body: "payload",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSyncStripeCustomerRecord).toHaveBeenCalledWith("user-1", "cus_123");
    expect(mockSyncSubscriptionById).toHaveBeenCalledWith("sub_123");
    expect(mockInsertProcessedStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("returns early for duplicate events", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_duplicate",
      type: "invoice.paid",
      created: 1,
      data: { object: { subscription: "sub_123" } },
    });
    mockHasProcessedStripeEvent.mockResolvedValue(true);

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "sig",
      },
      body: "payload",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSyncSubscriptionById).not.toHaveBeenCalled();
    expect(mockInsertProcessedStripeEvent).not.toHaveBeenCalled();
  });
});
