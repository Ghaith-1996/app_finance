import { getAppBaseUrl, getStripe } from "@/lib/billing/stripe";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

  const billingSummary = await getBillingSummaryForUser(user.id, supabase);
  if (!billingSummary.stripeCustomerId) {
    return json({ error: "No billing profile exists for this user yet." }, 404);
  }

  const stripe = getStripe();
  const configuration = process.env.STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID?.trim();
  const session = await stripe.billingPortal.sessions.create({
    customer: billingSummary.stripeCustomerId,
    return_url: `${getAppBaseUrl(request)}/settings`,
    ...(configuration ? { configuration } : {}),
  });

  return json({ url: session.url });
}
