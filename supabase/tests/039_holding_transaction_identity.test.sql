-- Review follow-up to B4: an operation id counts as a retry only when the whole change matches —
-- same holding and same add price included — and a sell-all retry still works after the holding
-- row (and so the ledger's holding_id foreign key) is gone.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000039a1', 'owner-039@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000f391', '00000000-0000-0000-0000-0000000039a1', 'B4 identity');
INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost) VALUES
  ('00000000-0000-0000-0000-0000000039c1', '00000000-0000-0000-0000-00000000f391', 'AAA', 'A', 'T', 'US', 10, 10),
  ('00000000-0000-0000-0000-0000000039c2', '00000000-0000-0000-0000-00000000f391', 'BBB', 'B', 'T', 'US', 10, 10),
  ('00000000-0000-0000-0000-0000000039c3', '00000000-0000-0000-0000-00000000f391', 'CCC', 'C', 'T', 'US', 10, 10);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000039a1', true);
DO $$
DECLARE
  p CONSTANT UUID := '00000000-0000-0000-0000-00000000f391';
  a CONSTANT UUID := '00000000-0000-0000-0000-0000000039c1';
  b CONSTANT UUID := '00000000-0000-0000-0000-0000000039c2';
  c CONSTANT UUID := '00000000-0000-0000-0000-0000000039c3';
  op CONSTANT UUID := '39000000-0000-0000-0000-000000000001';
  r JSONB;
  failed BOOLEAN;
BEGIN
  r := apply_holding_transaction(op, p, a, 'add', 5, 20);
  ASSERT r->>'status' = 'applied', format('first add %s', r);

  -- Same id, kind and quantity but a different holding: rejected, B unchanged.
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction(op, p, b, 'add', 5, 20);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'same id for a different holding was accepted as a duplicate';
  ASSERT (SELECT quantity FROM holdings WHERE id = b) = 10, 'holding B changed';

  -- Same id and holding but a different add price: rejected.
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction(op, p, a, 'add', 5, 25);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'same id with a different add price was accepted as a duplicate';

  -- An exact replay (price differing only beyond the stored precision) is still a duplicate.
  r := apply_holding_transaction(op, p, a, 'add', 5, 20.00001);
  ASSERT r->>'status' = 'duplicate', format('exact replay %s', r);
  ASSERT (SELECT quantity FROM holdings WHERE id = a) = 15, 'replay double-applied';

  -- Sell-all, then retry: the holding row is deleted (ledger holding_id becomes NULL) but the
  -- retry is recognised as the same operation.
  r := apply_holding_transaction('39000000-0000-0000-0000-000000000002', p, c, 'sell', 10, NULL);
  ASSERT (r->>'holdingClosed')::BOOLEAN, format('sell-all %s', r);
  r := apply_holding_transaction('39000000-0000-0000-0000-000000000002', p, c, 'sell', 10, NULL);
  ASSERT r->>'status' = 'duplicate', format('sell-all retry %s', r);

  -- ...and that id cannot be replayed against another holding.
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction('39000000-0000-0000-0000-000000000002', p, a, 'sell', 10, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'sell-all id replayed against another holding';
END $$;
ROLLBACK;
