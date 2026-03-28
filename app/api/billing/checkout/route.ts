import { getStripePriceIdForPlan, getStripe, getAppBaseUrl } from "@/lib/billing/stripe";
import { getBillingStateForUser } from "@/lib/billing/subscriptions";
import { getOrCreateStripeCustomerForUser } from "@/lib/billing/sync";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseRequestedPlan(value: unknown): "premium" | "ultimate" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "premium" || normalized === "ultimate") {
    return normalized;
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { plan?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const plan = parseRequestedPlan(body.plan);
  if (!plan) {
    return json({ error: "plan must be 'premium' or 'ultimate'" }, 400);
  }

  const billingState = await getBillingStateForUser(user.id);
  if (billingState.hasPaidAccess && billingState.planKey === plan) {
    return json({ error: `You are already on the ${plan} plan.` }, 409);
  }
  if (billingState.hasPaidAccess && billingState.planKey !== "free") {
    return json(
      {
        error: "Use Manage billing to change plans for an existing subscription.",
      },
      409,
    );
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomerForUser(user);
  const baseUrl = getAppBaseUrl(request);
  const trialDays = billingState.hasUsedTrial ? undefined : 7;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    customer: customerId,
    line_items: [
      {
        price: getStripePriceIdForPlan(plan),
        quantity: 1,
      },
    ],
    billing_address_collection: "auto",
    success_url: `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?billing=cancel`,
    metadata: {
      user_id: user.id,
      plan_key: plan,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan_key: plan,
      },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
  });

  if (!session.url) {
    return json({ error: "Stripe checkout did not return a redirect URL." }, 500);
  }

  return json({ url: session.url });
}
