-- Review P2 follow-up to 036/039: lock the holding before claiming the operation id.
--
-- 039 inserted the ledger row first. Its foreign key takes a KEY SHARE lock on the holding, and the
-- later SELECT ... FOR UPDATE conflicts with KEY SHARE held by another transaction. Two different
-- operations on the same holding could therefore both insert, then wait for each other: PostgreSQL
-- aborted one as a deadlock instead of applying both.
--
-- Now the ownership read takes FOR UPDATE on the holding first, so concurrent operations on a
-- holding queue on that single lock; the ledger insert's KEY SHARE is then already covered. Retry
-- semantics are unchanged: a duplicate id is detected by the insert's unique violation, or, when the
-- holding is gone (an earlier sell-all with the same id), by reading the existing ledger row.

CREATE OR REPLACE FUNCTION public.apply_holding_transaction(
  p_operation_id UUID,
  p_portfolio_id UUID,
  p_holding_id UUID,
  p_kind TEXT,
  p_quantity NUMERIC,
  p_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing holding_transactions%ROWTYPE;
  v_symbol TEXT;
  v_quantity NUMERIC;
  v_average_cost NUMERIC;
  v_new_quantity NUMERIC;
  v_new_average NUMERIC;
  v_closed BOOLEAN := false;
  v_duplicate BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_transaction: operation id is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('add', 'sell') THEN
    RAISE EXCEPTION 'invalid_transaction: unknown kind' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity >= 1e12 THEN
    RAISE EXCEPTION 'invalid_transaction: quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'add' AND (p_price IS NULL OR p_price < 0 OR p_price >= 1e12) THEN
    RAISE EXCEPTION 'invalid_transaction: price per share must be zero or positive' USING ERRCODE = '22023';
  END IF;

  -- Ownership + row lock first: every operation on this holding serializes here, before taking any
  -- lock that another operation could already hold.
  SELECT h.symbol, h.quantity, h.average_cost INTO v_symbol, v_quantity, v_average_cost
  FROM holdings h
  JOIN portfolios p ON p.id = h.portfolio_id
  WHERE h.id = p_holding_id AND h.portfolio_id = p_portfolio_id AND p.user_id = v_user_id
  FOR UPDATE OF h;

  IF v_symbol IS NOT NULL THEN
    -- Claim the operation id. A duplicate (retry, double click, concurrent request) returns the
    -- original outcome; reusing an id for a different change is rejected below.
    BEGIN
      INSERT INTO holding_transactions (id, user_id, portfolio_id, holding_id, requested_holding_id, symbol, kind, quantity, price)
      VALUES (p_operation_id, v_user_id, p_portfolio_id, p_holding_id, p_holding_id, v_symbol, p_kind, p_quantity,
              CASE WHEN p_kind = 'add' THEN p_price ELSE NULL END);
    EXCEPTION WHEN unique_violation THEN
      v_duplicate := true;
    END;
  ELSE
    -- No holding to lock (not owned, never existed, or closed by an earlier sell-all): only a replay
    -- of a recorded operation can succeed.
    v_duplicate := EXISTS (SELECT 1 FROM holding_transactions WHERE id = p_operation_id);
  END IF;

  IF v_duplicate THEN
    SELECT * INTO v_existing FROM holding_transactions WHERE id = p_operation_id;
    -- Only an exact replay is a duplicate: same holding (requested id survives the holding row being
    -- deleted by a sell-all; legacy rows fall back to holding_id) and, for adds, the same price at
    -- the precision it is stored with.
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.portfolio_id IS DISTINCT FROM p_portfolio_id
       OR coalesce(v_existing.requested_holding_id, v_existing.holding_id) IS DISTINCT FROM p_holding_id
       OR v_existing.kind IS DISTINCT FROM p_kind
       OR v_existing.quantity IS DISTINCT FROM p_quantity::NUMERIC(18, 6)
       OR v_existing.price IS DISTINCT FROM (CASE WHEN p_kind = 'add' THEN p_price::NUMERIC(18, 4) END) THEN
      RAISE EXCEPTION 'invalid_transaction: operation id was already used for a different change'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'quantityAfter', v_existing.quantity_after,
      'averageCostAfter', v_existing.average_cost_after,
      'holdingClosed', v_existing.holding_closed
    );
  END IF;

  IF v_symbol IS NULL THEN
    RAISE EXCEPTION 'Holding not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_kind = 'add' THEN
    v_new_quantity := v_quantity + p_quantity;
    v_new_average := round((v_quantity * v_average_cost + p_quantity * p_price) / v_new_quantity, 4);
    UPDATE holdings
    SET quantity = v_new_quantity, average_cost = v_new_average, updated_at = now()
    WHERE id = p_holding_id;
  ELSE
    IF p_quantity > v_quantity + 1e-9 THEN
      RAISE EXCEPTION 'invalid_transaction: you cannot sell more shares than you currently hold'
        USING ERRCODE = '22023';
    END IF;
    v_new_quantity := v_quantity - p_quantity;
    v_new_average := v_average_cost;
    IF v_new_quantity <= 1e-8 THEN
      v_new_quantity := 0;
      v_closed := true;
      DELETE FROM holdings WHERE id = p_holding_id;
    ELSE
      UPDATE holdings SET quantity = v_new_quantity, updated_at = now() WHERE id = p_holding_id;
    END IF;
  END IF;

  UPDATE holding_transactions
  SET quantity_after = v_new_quantity, average_cost_after = v_new_average, holding_closed = v_closed
  WHERE id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'applied',
    'quantityAfter', v_new_quantity,
    'averageCostAfter', v_new_average,
    'holdingClosed', v_closed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_holding_transaction(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_holding_transaction(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC) TO authenticated;
