CREATE TABLE IF NOT EXISTS user_investment_thesis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES user_investment_theses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('holding', 'watchlist')),
  symbol TEXT NOT NULL,
  thesis TEXT NOT NULL DEFAULT '',
  risks TEXT[] NOT NULL DEFAULT '{}',
  invalidation_notes TEXT NOT NULL DEFAULT '',
  horizon TEXT NOT NULL,
  conviction TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'updated'
    CHECK (change_type IN ('created', 'updated', 'deleted')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_investment_thesis_history_user_symbol
  ON user_investment_thesis_history(user_id, symbol, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_investment_thesis_history_thesis
  ON user_investment_thesis_history(thesis_id, captured_at DESC);

ALTER TABLE user_investment_thesis_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own investment thesis history"
  ON user_investment_thesis_history;

CREATE POLICY "Users can read own investment thesis history"
  ON user_investment_thesis_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own investment thesis history"
  ON user_investment_thesis_history;

CREATE POLICY "Users can insert own investment thesis history"
  ON user_investment_thesis_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON user_investment_thesis_history TO authenticated;
GRANT ALL ON user_investment_thesis_history TO service_role;

COMMENT ON TABLE user_investment_thesis_history IS
  'Append-only snapshots of previous investment thesis versions for user review.';
