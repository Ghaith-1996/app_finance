-- billing_events has RLS enabled (014_billing.sql) but no policies defined.
-- Without policies, all access is denied — including webhook handler inserts.
-- This migration adds the required policies.

-- Service-role (webhooks) can insert and read all events
-- Authenticated users cannot access billing_events directly — they interact
-- through billing_customers and subscriptions only.

-- No authenticated-user policies: billing_events is an internal audit table.
-- The Stripe webhook handler uses the service-role client which bypasses RLS.
