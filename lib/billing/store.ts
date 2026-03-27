import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type BillingCustomerRow = {
  user_id: string;
  stripe_customer_id: string;
  created_at?: string;
  updated_at?: string;
};

export type SubscriptionRow = {
  id?: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  stripe_product_id: string | null;
  plan_key: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  raw: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type UserSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ServiceSupabaseClient = ReturnType<typeof createServiceClient>;
export type BillingSupabaseClient = UserSupabaseClient | ServiceSupabaseClient;

export async function loadBillingCustomerByUserId(
  supabase: BillingSupabaseClient,
  userId: string,
): Promise<BillingCustomerRow | null> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as BillingCustomerRow | null) ?? null;
}

export async function loadBillingCustomerByStripeCustomerId(
  supabase: BillingSupabaseClient,
  stripeCustomerId: string,
): Promise<BillingCustomerRow | null> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id, created_at, updated_at")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as BillingCustomerRow | null) ?? null;
}

export async function upsertBillingCustomer(
  supabase: BillingSupabaseClient,
  row: BillingCustomerRow,
): Promise<void> {
  const { error } = await supabase
    .from("billing_customers")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function loadSubscriptionsForUser(
  supabase: BillingSupabaseClient,
  userId: string,
): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, stripe_product_id, plan_key, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, raw, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("current_period_end", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as SubscriptionRow[] | null) ?? [];
}

export async function upsertSubscriptionRow(
  supabase: BillingSupabaseClient,
  row: SubscriptionRow,
): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function hasProcessedStripeEvent(
  supabase: BillingSupabaseClient,
  stripeEventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("billing_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return !!data;
}

export async function insertProcessedStripeEvent(
  supabase: BillingSupabaseClient,
  input: {
    stripeEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("billing_events").insert({
    stripe_event_id: input.stripeEventId,
    event_type: input.eventType,
    payload: input.payload,
  });

  if (error) {
    throw new Error(error.message);
  }
}
