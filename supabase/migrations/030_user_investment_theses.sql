CREATE TABLE IF NOT EXISTS user_investment_theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'holding'
    CHECK (scope IN ('holding', 'watchlist')),
  symbol TEXT NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 16),
  thesis TEXT NOT NULL DEFAULT '',
  risks TEXT[] NOT NULL DEFAULT '{}',
  invalidation_notes TEXT NOT NULL DEFAULT '',
  horizon TEXT NOT NULL DEFAULT 'medium'
    CHECK (horizon IN ('watch', 'short', 'medium', 'long')),
  conviction TEXT NOT NULL DEFAULT 'medium'
    CHECK (conviction IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_investment_theses_user_symbol
  ON user_investment_theses(user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_user_investment_theses_portfolio
  ON user_investment_theses(portfolio_id, symbol)
  WHERE portfolio_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_investment_theses_portfolio_unique
  ON user_investment_theses(user_id, portfolio_id, symbol)
  WHERE portfolio_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_investment_theses_watchlist_unique
  ON user_investment_theses(user_id, scope, symbol)
  WHERE portfolio_id IS NULL;

DROP TRIGGER IF EXISTS user_investment_theses_updated_at
  ON user_investment_theses;

CREATE TRIGGER user_investment_theses_updated_at
  BEFORE UPDATE ON user_investment_theses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_investment_theses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own investment theses"
  ON user_investment_theses;

CREATE POLICY "Users can read own investment theses"
  ON user_investment_theses FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      portfolio_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM portfolios
        WHERE portfolios.id = user_investment_theses.portfolio_id
          AND portfolios.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can create own investment theses"
  ON user_investment_theses;

CREATE POLICY "Users can create own investment theses"
  ON user_investment_theses FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      portfolio_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM portfolios
        WHERE portfolios.id = user_investment_theses.portfolio_id
          AND portfolios.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own investment theses"
  ON user_investment_theses;

CREATE POLICY "Users can update own investment theses"
  ON user_investment_theses FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      portfolio_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM portfolios
        WHERE portfolios.id = user_investment_theses.portfolio_id
          AND portfolios.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (
      portfolio_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM portfolios
        WHERE portfolios.id = user_investment_theses.portfolio_id
          AND portfolios.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own investment theses"
  ON user_investment_theses;

CREATE POLICY "Users can delete own investment theses"
  ON user_investment_theses FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      portfolio_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM portfolios
        WHERE portfolios.id = user_investment_theses.portfolio_id
          AND portfolios.user_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON user_investment_theses TO authenticated;
GRANT ALL ON user_investment_theses TO service_role;

COMMENT ON TABLE user_investment_theses IS
  'Per-user thesis tracker for portfolio holdings and watchlist symbols.';
COMMENT ON COLUMN user_investment_theses.risks IS
  'User-defined risks or thesis breakers used to connect news back to the saved investment thesis.';
