-- Hourly portfolio value history for performance charts.
-- Written by the service-role hourly cron; users can only read rows for portfolios they own.

CREATE TABLE IF NOT EXISTS portfolio_value_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bucket_start TIMESTAMPTZ NOT NULL,
  total_value DECIMAL(18, 4) NOT NULL DEFAULT 0,
  cost_basis DECIMAL(18, 4) NOT NULL DEFAULT 0,
  day_change_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
  quote_currency TEXT NOT NULL DEFAULT 'USD',
  positions_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_value_snapshots_portfolio_time
  ON portfolio_value_snapshots (portfolio_id, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_value_snapshots_user_time
  ON portfolio_value_snapshots (user_id, bucket_start DESC);

ALTER TABLE portfolio_value_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own portfolio value snapshots"
  ON portfolio_value_snapshots;

CREATE POLICY "Users can read own portfolio value snapshots"
  ON portfolio_value_snapshots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
