import Stripe from "stripe";

import { createLogger } from "@/lib/logger";
import {
  getStripe,
  requireStripeWebhookSecret,
} from "@/lib/billing/stripe";
import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
} from "@/lib/billing/store";
import {
  syncStripeCustomerRecord,
  syncSubscriptionById,
  syncSubscriptionFromStripeSubscription,
} from "@/lib/billing/sync";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const log = createLogger("stripe-webhook");
const HANDLED_STRIPE_EVENT_TYPES = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractStripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

function buildEventAuditPayload(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as unknown as Record<string, unknown>;
  const invoiceSubscription =
    object.parent && typeof object.parent === "object"
      ? ((object.parent as { subscription_details?: { subscription?: unknown } })
          .subscription_details?.subscription ?? null)
      : null;
  const subscriptionRef =
    (object as { subscription?: unknown }).subscription ?? invoiceSubscription;

  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    api_version: event.api_version ?? null,
    object: typeof object.object === "string" ? object.object : null,
    object_id: extractStripeObjectId(object),
    customer_id: extractStripeObjectId((object as { customer?: unknown }).customer),
    subscription_id: extractStripeObjectId(subscriptionRef),
  };
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id?.trim();
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;

      if (userId && customerId) {
        await syncStripeCustomerRecord(userId, customerId);
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      if (subscriptionId) {
        await syncSubscriptionById(subscriptionId);
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionById(subscription.id);
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await syncSubscriptionById(subscription.id);
      } catch (error) {
        log.warn("Stripe deleted subscription could not be re-fetched; using event payload", {
          subscriptionId: subscription.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        await syncSubscriptionFromStripeSubscription(subscription);
      }
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionDetails = invoice.parent?.subscription_details;
      const subscriptionId =
        typeof subscriptionDetails?.subscription === "string"
          ? subscriptionDetails.subscription
          : subscriptionDetails?.subscription?.id ?? null;
      if (subscriptionId) {
        await syncSubscriptionById(subscriptionId);
      }
      return;
    }

    default:
      return;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing Stripe signature header." }, 400);
  }

  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      requireStripeWebhookSecret(),
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Stripe signature verification failed.",
      },
      400,
    );
  }

  if (!HANDLED_STRIPE_EVENT_TYPES.has(event.type)) {
    return json({ received: true, ignored: true });
  }

  const serviceSupabase = createServiceClient();
  const auditPayload = buildEventAuditPayload(event);
  const claimResult = await claimStripeEvent(serviceSupabase, {
    stripeEventId: event.id,
    eventType: event.type,
    payload: auditPayload,
  });

  if (claimResult === "already_processed") {
    return json({ received: true, duplicate: true });
  }

  if (claimResult === "in_progress") {
    return json({ error: "Event is already being processed. Retry shortly." }, 409);
  }

  try {
    await handleStripeEvent(event);
    await markStripeEventProcessed(serviceSupabase, event.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markStripeEventFailed(serviceSupabase, {
      stripeEventId: event.id,
      eventType: event.type,
      payload: auditPayload,
      errorMessage: message,
    });

    log.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message,
    });
    return json({ error: "Webhook processing failed." }, 500);
  }

  return json({ received: true });
}