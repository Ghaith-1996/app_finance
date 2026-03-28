import "server-only";

import type Stripe from "stripe";
import type { User } from "@supabase/supabase-js";

import { planFromStripePriceId, getStripe } from "@/lib/billing/stripe";
import {
  loadBillingCustomerByStripeCustomerId,
  loadBillingCustomerByUserId,
  upsertBillingCustomer,
  upsertSubscriptionRow,
} from "@/lib/billing/store";
import { deriveStripeCustomerName } from "@/lib/billing/subscriptions";
import { createServiceClient } from "@/lib/supabase/service";

function toIsoFromUnix(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function buildSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): Record<string, unknown> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  return {
    id: subscription.id,
    customer_id: customerId,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: toIsoFromUnix(subscription.canceled_at),
    trial_start: toIsoFromUnix(subscription.trial_start),
    trial_end: toIsoFromUnix(subscription.trial_end),
    metadata: {
      user_id: subscription.metadata?.user_id ?? null,
      plan_key: subscription.metadata?.plan_key ?? null,
    },
    items: subscription.items.data.map((item) => {
      const product = item.price?.product;
      const productId = typeof product === "string" ? product : product?.id ?? null;

      return {
        id: item.id,
        price_id: item.price?.id ?? null,
        product_id: productId,
        quantity: item.quantity ?? null,
        current_period_start:
          typeof item.current_period_start === "number"
            ? toIsoFromUnix(item.current_period_start)
            : null,
        current_period_end:
          typeof item.current_period_end === "number"
            ? toIsoFromUnix(item.current_period_end)
            : null,
      };
    }),
  };
}

async function resolveUserIdForStripeCustomer(
  stripeCustomerId: string,
  subscription?: Stripe.Subscription,
): Promise<string> {
  const serviceSupabase = createServiceClient();
  const existingCustomer = await loadBillingCustomerByStripeCustomerId(
    serviceSupabase,
    stripeCustomerId,
  );
  if (existingCustomer?.user_id) {
    return existingCustomer.user_id;
  }

  const metadataUserId = subscription?.metadata?.user_id?.trim();
  if (metadataUserId) {
    return metadataUserId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (!customer.deleted) {
    const customerUserId = customer.metadata?.user_id?.trim();
    if (customerUserId) {
      return customerUserId;
    }
  }

  throw new Error(`Could not resolve app user for Stripe customer ${stripeCustomerId}`);
}

function normalizeSubscription(
  userId: string,
  subscription: Stripe.Subscription,
) {
  const primaryItem = subscription.items.data[0];
  const priceId = primaryItem?.price?.id ?? null;
  const planKey = planFromStripePriceId(priceId);
  if (!priceId || !planKey) {
    throw new Error(
      `Stripe subscription ${subscription.id} uses an unknown price: ${priceId ?? "missing"}`,
    );
  }

  const product = primaryItem.price.product;
  const productId = typeof product === "string" ? product : product?.id ?? null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const currentPeriodStart =
    typeof primaryItem?.current_period_start === "number"
      ? primaryItem.current_period_start
      : null;
  const currentPeriodEnd =
    typeof primaryItem?.current_period_end === "number"
      ? primaryItem.current_period_end
      : null;

  return {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    stripe_product_id: productId,
    plan_key: planKey,
    status: subscription.status,
    current_period_start: toIsoFromUnix(currentPeriodStart),
    current_period_end: toIsoFromUnix(currentPeriodEnd),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: toIsoFromUnix(subscription.canceled_at),
    trial_start: toIsoFromUnix(subscription.trial_start),
    trial_end: toIsoFromUnix(subscription.trial_end),
    raw: buildSubscriptionSnapshot(subscription),
  };
}

export async function getOrCreateStripeCustomerForUser(user: User): Promise<string> {
  const serviceSupabase = createServiceClient();
  const existing = await loadBillingCustomerByUserId(serviceSupabase, user.id);
  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: deriveStripeCustomerName(user),
    metadata: {
      user_id: user.id,
    },
  });

  await upsertBillingCustomer(serviceSupabase, {
    user_id: user.id,
    stripe_customer_id: customer.id,
  });

  return customer.id;
}

export async function syncStripeCustomerRecord(
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  const serviceSupabase = createServiceClient();
  await upsertBillingCustomer(serviceSupabase, {
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
  });
}

export async function syncSubscriptionFromStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const userId = await resolveUserIdForStripeCustomer(customerId, subscription);
  const serviceSupabase = createServiceClient();

  await upsertBillingCustomer(serviceSupabase, {
    user_id: userId,
    stripe_customer_id: customerId,
  });
  await upsertSubscriptionRow(serviceSupabase, normalizeSubscription(userId, subscription));
}

export async function syncSubscriptionById(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });

  await syncSubscriptionFromStripeSubscription(subscription);
}