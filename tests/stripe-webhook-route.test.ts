import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConstructEvent = vi.fn();
const mockClaimStripeEvent = vi.fn();
const mockMarkStripeEventProcessed = vi.fn();
const mockMarkStripeEventFailed = vi.fn();
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
  claimStripeEvent: (...args: unknown[]) => mockClaimStripeEvent(...args),
  markStripeEventProcessed: (...args: unknown[]) => mockMarkStripeEventProcessed(...args),
  markStripeEventFailed: (...args: unknown[]) => mockMarkStripeEventFailed(...args),
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
    mockClaimStripeEvent.mockResolvedValue("claimed");
    mockMarkStripeEventProcessed.mockResolvedValue(undefined);
    mockMarkStripeEventFailed.mockResolvedValue(undefined);
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
    expect(mockClaimStripeEvent).toHaveBeenCalledTimes(1);
    expect(mockSyncStripeCustomerRecord).toHaveBeenCalledWith("user-1", "cus_123");
    expect(mockSyncSubscriptionById).toHaveBeenCalledWith("sub_123");
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledTimes(1);
    expect(mockClaimStripeEvent).toHaveBeenCalledWith(
      { kind: "service-client" },
      expect.objectContaining({
        stripeEventId: "evt_123",
        eventType: "checkout.session.completed",
        payload: expect.objectContaining({
          id: "evt_123",
          type: "checkout.session.completed",
          customer_id: "cus_123",
          subscription_id: "sub_123",
        }),
      }),
    );
  });

  it("returns early for duplicate events", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_duplicate",
      type: "invoice.paid",
      created: 1,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });
    mockClaimStripeEvent.mockResolvedValue("already_processed");

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
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
    expect(mockMarkStripeEventFailed).not.toHaveBeenCalled();
  });

  it("returns 409 while another worker is already processing the same event", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_busy",
      type: "invoice.paid",
      created: 1,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });
    mockClaimStripeEvent.mockResolvedValue("in_progress");

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "sig",
      },
      body: "payload",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(mockSyncSubscriptionById).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("marks the event as failed when downstream sync throws", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_fail",
      type: "invoice.paid",
      created: 1,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });
    mockSyncSubscriptionById.mockRejectedValue(new Error("subscription sync failed"));

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "sig",
      },
      body: "payload",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(mockMarkStripeEventFailed).toHaveBeenCalledWith(
      { kind: "service-client" },
      expect.objectContaining({
        stripeEventId: "evt_fail",
        eventType: "invoice.paid",
        errorMessage: "subscription sync failed",
      }),
    );
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("ignores unhandled Stripe event types without storing payloads", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_misc",
      type: "charge.succeeded",
      created: 1,
      data: { object: { id: "ch_123", object: "charge" } },
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
    expect(mockClaimStripeEvent).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
    expect(mockMarkStripeEventFailed).not.toHaveBeenCalled();
    expect(mockSyncSubscriptionById).not.toHaveBeenCalled();
  });
});
