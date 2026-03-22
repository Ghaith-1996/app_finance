-- Extend holdings with real position data (quantity, cost, live price, computed gain fields)
-- Existing columns (price, daily_change, allocation) are preserved for backward compatibility.

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS quantity               DECIMAL(18, 6)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_cost           DECIMAL(18, 4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_price          DECIMAL(18, 4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_currency         TEXT            NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS quote_as_of            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source          TEXT            NOT NULL DEFAULT 'manual';

-- Computed columns require separate statements in Postgres
ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS cost_basis             DECIMAL(18, 4)
    GENERATED ALWAYS AS (quantity * average_cost) STORED;

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS current_value          DECIMAL(18, 4)
    GENERATED ALWAYS AS (quantity * current_price) STORED;

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS unrealized_gain_amount DECIMAL(18, 4)
    GENERATED ALWAYS AS (quantity * (current_price - average_cost)) STORED;

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS unrealized_gain_percent DECIMAL(8, 4)
    GENERATED ALWAYS AS (
      CASE WHEN average_cost > 0
           THEN ((current_price - average_cost) / average_cost) * 100
           ELSE 0 END
    ) STORED;
