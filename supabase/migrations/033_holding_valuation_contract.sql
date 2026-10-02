-- Audit B2/B3/B5: valuation contract columns and atomic price application.
--
-- previous_close   provider previous close in the quote currency (exact prior-value basis for day return)
-- fx_rate_to_usd   quote-currency → USD multiplier captured with the quote; NULL = unknown, so the
--                  position is reported as unavailable instead of being summed unconverted
-- fx_as_of         when that FX rate was fetched
--
-- Only USD rows are backfilled (rate 1 is definitional). Non-USD rows stay NULL until their next
-- quote refresh; historical portfolio_value_snapshots are intentionally not rewritten here.

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS previous_close NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS fx_rate_to_usd NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS fx_as_of TIMESTAMPTZ;

UPDATE holdings
SET fx_rate_to_usd = 1, fx_as_of = coalesce(quote_as_of, updated_at)
WHERE quote_currency = 'USD' AND fx_rate_to_usd IS NULL;

-- DECIMAL(8,4) overflows for gains above 9,999% (e.g. long-held, split-adjusted positions),
-- which would make every price write for that holding — and now its whole batch — fail.
ALTER TABLE holdings ALTER COLUMN unrealized_gain_percent TYPE NUMERIC(14, 4);

-- Applies a whole-portfolio price/allocation update in one transaction.
-- p_updates: [{ "id": uuid, "allocation": number, optional quote fields:
--   "price", "previousClose", "dailyChange", "currency", "quoteAsOf", "fxRateToUsd", "fxAsOf" }]
-- p_sync_state: 'complete' stamps last_synced_at and sync_status=active;
--               'partial' sets sync_status=stale and leaves last_synced_at untouched.
CREATE OR REPLACE FUNCTION public.apply_holding_price_updates(
  p_portfolio_id UUID,
  p_updates JSONB,
  p_sync_state TEXT,
  p_synced_at TIMESTAMPTZ
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_updated INT := 0;
  v_rows INT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM 1 FROM portfolios WHERE id = p_portfolio_id AND user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Portfolio not found or unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSIF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  ELSE
    PERFORM 1 FROM portfolios WHERE id = p_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Portfolio not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_sync_state NOT IN ('complete', 'partial') THEN
    RAISE EXCEPTION 'invalid sync state' USING ERRCODE = '22023';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'updates must be an array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    IF v_item ? 'price' THEN
      UPDATE holdings
      SET price = (v_item->>'price')::NUMERIC,
          current_price = (v_item->>'price')::NUMERIC,
          previous_close = (v_item->>'previousClose')::NUMERIC,
          daily_change = (v_item->>'dailyChange')::NUMERIC,
          quote_currency = coalesce(v_item->>'currency', quote_currency),
          quote_as_of = (v_item->>'quoteAsOf')::TIMESTAMPTZ,
          fx_rate_to_usd = (v_item->>'fxRateToUsd')::NUMERIC,
          fx_as_of = (v_item->>'fxAsOf')::TIMESTAMPTZ,
          allocation = (v_item->>'allocation')::NUMERIC,
          updated_at = now()
      WHERE id = (v_item->>'id')::UUID AND portfolio_id = p_portfolio_id;
    ELSE
      UPDATE holdings
      SET allocation = (v_item->>'allocation')::NUMERIC,
          updated_at = now()
      WHERE id = (v_item->>'id')::UUID AND portfolio_id = p_portfolio_id;
    END IF;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'holding % is not part of portfolio', v_item->>'id' USING ERRCODE = '22023';
    END IF;
    v_updated := v_updated + 1;
  END LOOP;

  IF p_sync_state = 'complete' THEN
    UPDATE portfolios SET last_synced_at = p_synced_at, sync_status = 'active' WHERE id = p_portfolio_id;
  ELSE
    UPDATE portfolios SET sync_status = 'stale' WHERE id = p_portfolio_id;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_holding_price_updates(UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_holding_price_updates(UUID, JSONB, TEXT, TIMESTAMPTZ) TO authenticated, service_role;
