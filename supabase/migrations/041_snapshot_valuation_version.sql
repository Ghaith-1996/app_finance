-- Review R3: snapshots written since the canonical valuation contract (033) hold USD-normalized
-- totals; older rows hold sums of each holding's own quote currency, labelled USD or not. Mixing
-- the two in one chart shows fictitious moves (100 CAD then 73 USD for an unchanged position), and
-- quote_currency cannot tell them apart.
--
-- valuation_version marks the unit of total_value/cost_basis. Rows written before this migration
-- stay NULL and are excluded from history: their original per-holding currencies were not kept, so
-- they cannot be converted reliably and historical FX rates are not invented. The writer sets 2.

ALTER TABLE portfolio_value_snapshots ADD COLUMN IF NOT EXISTS valuation_version SMALLINT;

CREATE INDEX IF NOT EXISTS idx_portfolio_value_snapshots_portfolio_version_time
  ON portfolio_value_snapshots (portfolio_id, valuation_version, bucket_start DESC);
