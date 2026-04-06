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

export type StripeEventProcessingState = "processing" | "processed" | "failed";
export type StripeEventClaimResult = "claimed" | "already_processed" | "in_progress";

const STRIPE_EVENT_PROCESSING_STALE_MS = 10 * 60 * 1000;

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
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function claimStripeEvent(
  supabase: BillingSupabaseClient,
  input: {
    stripeEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<StripeEventClaimResult> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("billing_events").insert({
    stripe_event_id: input.stripeEventId,
    event_type: input.eventType,
    payload: input.payload,
    processing_state: "processing",
    processed_at: nowIso,
    last_error: null,
  });

  if (!error) return "claimed";

  if ((error as { code?: string }).code !== "23505") {
    throw new Error(error.message);
  }

  const { data: existing, error: existingError } = await supabase
    .from("billing_events")
    .select("processing_state, processed_at")
    .eq("stripe_event_id", input.stripeEventId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRow = existing as {
    processing_state?: StripeEventProcessingState;
    processed_at?: string | null;
  } | null;

  if (existingRow?.processing_state === "processed") {
    return "already_processed";
  }

  const reclaimPayload = {
    event_type: input.eventType,
    payload: input.payload,
    processing_state: "processing" as const,
    processed_at: nowIso,
    last_error: null,
  };

  if (existingRow?.processing_state === "failed") {
    const { data: reclaimed, error: reclaimError } = await supabase
      .from("billing_events")
      .update(reclaimPayload)
      .eq("stripe_event_id", input.stripeEventId)
      .eq("processing_state", "failed")
      .select("stripe_event_id")
      .maybeSingle();

    if (reclaimError) {
      throw new Error(reclaimError.message);
    }

    return reclaimed ? "claimed" : "in_progress";
  }

  const processedAtMs = existingRow?.processed_at
    ? new Date(existingRow.processed_at).getTime()
    : Number.NaN;
  const staleBeforeIso = new Date(
    Date.now() - STRIPE_EVENT_PROCESSING_STALE_MS,
  ).toISOString();

  if (
    existingRow?.processing_state === "processing" &&
    Number.isFinite(processedAtMs) &&
    processedAtMs < Date.now() - STRIPE_EVENT_PROCESSING_STALE_MS
  ) {
    const { data: reclaimed, error: reclaimError } = await supabase
      .from("billing_events")
      .update(reclaimPayload)
      .eq("stripe_event_id", input.stripeEventId)
      .eq("processing_state", "processing")
      .lt("processed_at", staleBeforeIso)
      .select("stripe_event_id")
      .maybeSingle();

    if (reclaimError) {
      throw new Error(reclaimError.message);
    }

    return reclaimed ? "claimed" : "in_progress";
  }

  return "in_progress";
}

export async function markStripeEventProcessed(
  supabase: BillingSupabaseClient,
  stripeEventId: string,
): Promise<void> {
  const { error } = await supabase
    .from("billing_events")
    .update({
      processing_state: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("stripe_event_id", stripeEventId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markStripeEventFailed(
  supabase: BillingSupabaseClient,
  input: {
    stripeEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    errorMessage: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("billing_events")
    .update({
      event_type: input.eventType,
      payload: input.payload,
      processing_state: "failed",
      processed_at: new Date().toISOString(),
      last_error: input.errorMessage.slice(0, 1000),
    })
    .eq("stripe_event_id", input.stripeEventId);

  if (error) {
    throw new Error(error.message);
  }
}
