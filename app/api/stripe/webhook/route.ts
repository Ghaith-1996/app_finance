import Stripe from "stripe";

import { createLogger } from "@/lib/logger";
import {
  getStripe,
  requireStripeWebhookSecret,
} from "@/lib/billing/stripe";
import {
  hasProcessedStripeEvent,
  insertProcessedStripeEvent,
} from "@/lib/billing/store";
import {
  syncStripeCustomerRecord,
  syncSubscriptionById,
  syncSubscriptionFromStripeSubscription,
} from "@/lib/billing/sync";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const log = createLogger("stripe-webhook");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toPlainObject<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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

  const serviceSupabase = createServiceClient();
  if (await hasProcessedStripeEvent(serviceSupabase, event.id)) {
    return json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
    await insertProcessedStripeEvent(serviceSupabase, {
      stripeEventId: event.id,
      eventType: event.type,
      payload: toPlainObject(event),
    });
  } catch (error) {
    log.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "Webhook processing failed." }, 500);
  }

  return json({ received: true });
}
