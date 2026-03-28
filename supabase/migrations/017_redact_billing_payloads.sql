-- Redact historical Stripe payloads now that billing state is derived from explicit columns.
-- This keeps enough audit information to troubleshoot billing state without retaining full Stripe objects.

UPDATE subscriptions
SET raw = jsonb_strip_nulls(
  jsonb_build_object(
    'id', stripe_subscription_id,
    'customer_id', stripe_customer_id,
    'price_id', stripe_price_id,
    'product_id', stripe_product_id,
    'plan_key', plan_key,
    'status', status,
    'current_period_start', current_period_start,
    'current_period_end', current_period_end,
    'cancel_at_period_end', cancel_at_period_end,
    'canceled_at', canceled_at,
    'trial_start', trial_start,
    'trial_end', trial_end,
    'redacted', true
  )
);

UPDATE billing_events
SET payload = jsonb_build_object(
  'id', stripe_event_id,
  'type', event_type,
  'processed_at', processed_at,
  'redacted', true
);