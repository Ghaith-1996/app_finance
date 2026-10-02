-- Audit B4: share additions and sales are applied atomically, exactly once.
--
-- holding_transactions is an immutable ledger keyed by a client-generated operation id. The RPC
-- inserts the ledger row first: it is the idempotency claim. A concurrent or retried call with the
-- same id waits on the primary key and then returns the original result instead of applying the
-- change again. The holding row is locked (FOR UPDATE) for the read-modify-write, so concurrent
-- different operations serialize and each accepted change is applied exactly once; overselling is
-- rejected inside the same transaction. Any failure rolls back both the ledger row and the change.

CREATE TABLE IF NOT EXISTS holding_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES holdings(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('add', 'sell')),
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  price NUMERIC(18, 4) CHECK (price IS NULL OR price >= 0),
  quantity_after NUMERIC(18, 6),
  average_cost_after NUMERIC(18, 4),
  holding_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holding_transactions_portfolio_created
  ON holding_transactions (portfolio_id, created_at DESC);

ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;

-- Owners can read their ledger; rows are only written by apply_holding_transaction (SECURITY
-- INVOKER, so the insert policy below still applies) and are never updated or deleted by users.
DROP POLICY IF EXISTS "Owners can read holding transactions" ON holding_transactions;
CREATE POLICY "Owners can read holding transactions"
  ON holding_transactions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can record holding transactions" ON holding_transactions;
CREATE POLICY "Owners can record holding transactions"
  ON holding_transactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND portfolio_id IN (SELECT id FROM portfolios WHERE user_id = (SELECT auth.uid()))
  );

-- The function fills quantity_after/average_cost_after on the row it just claimed.
DROP POLICY IF EXISTS "Owners finalize their pending holding transactions" ON holding_transactions;
CREATE POLICY "Owners finalize their pending holding transactions"
  ON holding_transactions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND quantity_after IS NULL)
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT ON holding_transactions TO authenticated;
GRANT UPDATE (quantity_after, average_cost_after, holding_closed) ON holding_transactions TO authenticated;
GRANT ALL ON holding_transactions TO service_role;

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

  -- Ownership + current symbol, before claiming the operation id.
  SELECT h.symbol INTO v_symbol
  FROM holdings h
  JOIN portfolios p ON p.id = h.portfolio_id
  WHERE h.id = p_holding_id AND h.portfolio_id = p_portfolio_id AND p.user_id = v_user_id;

  -- Claim the operation id. A duplicate (retry, double click, concurrent request) returns the
  -- original outcome; reusing an id for a different change is rejected.
  BEGIN
    INSERT INTO holding_transactions (id, user_id, portfolio_id, holding_id, symbol, kind, quantity, price)
    VALUES (p_operation_id, v_user_id, p_portfolio_id, p_holding_id, coalesce(v_symbol, ''), p_kind, p_quantity,
            CASE WHEN p_kind = 'add' THEN p_price ELSE NULL END);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM holding_transactions WHERE id = p_operation_id;
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.portfolio_id IS DISTINCT FROM p_portfolio_id
       OR v_existing.kind IS DISTINCT FROM p_kind
       OR v_existing.quantity IS DISTINCT FROM p_quantity::NUMERIC(18, 6) THEN
      RAISE EXCEPTION 'invalid_transaction: operation id was already used for a different change'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'quantityAfter', v_existing.quantity_after,
      'averageCostAfter', v_existing.average_cost_after,
      'holdingClosed', v_existing.holding_closed
    );
  END;

  IF v_symbol IS NULL THEN
    RAISE EXCEPTION 'Holding not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT quantity, average_cost INTO v_quantity, v_average_cost
  FROM holdings
  WHERE id = p_holding_id AND portfolio_id = p_portfolio_id
  FOR UPDATE;
  IF NOT FOUND THEN
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
