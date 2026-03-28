-- Billing data is server-only application state.
-- Authenticated users should receive a derived billing summary from the app,
-- not direct access to raw Stripe identifiers or payload columns.

DROP POLICY IF EXISTS "Users can read own billing customer" ON billing_customers;
DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;
