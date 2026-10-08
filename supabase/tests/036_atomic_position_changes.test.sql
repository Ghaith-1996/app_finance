-- Audit B4 acceptance: concurrent accepted share changes each apply exactly once; retries are
-- idempotent; overselling is impossible. Concurrency uses two real sessions via dblink.

-- Committed fixtures (other sessions must see them). Fresh container per run.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000004a1', 'owner-b4@example.test'),
  ('00000000-0000-0000-0000-0000000004b2', 'other-b4@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-0000000004a1', 'B4');
INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost) VALUES
  ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-00000000f401', 'AAA', 'A', 'T', 'US', 10, 10),
  ('00000000-0000-0000-0000-0000000004c2', '00000000-0000-0000-0000-00000000f401', 'BBB', 'B', 'T', 'US', 10, 10),
  ('00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-00000000f401', 'CCC', 'C', 'T', 'US', 10, 10);

-- 1. Sequential semantics as the owner (rolled back).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);
DO $$
DECLARE
  p CONSTANT UUID := '00000000-0000-0000-0000-00000000f401';
  h CONSTANT UUID := '00000000-0000-0000-0000-0000000004c1';
  r JSONB;
  failed BOOLEAN;
BEGIN
  r := apply_holding_transaction('10000000-0000-0000-0000-000000000001', p, h, 'add', 10, 20);
  ASSERT r->>'status' = 'applied' AND (r->>'quantityAfter')::NUMERIC = 20 AND (r->>'averageCostAfter')::NUMERIC = 15,
    format('add result %s', r);

  -- Retry of the same operation does not apply twice.
  r := apply_holding_transaction('10000000-0000-0000-0000-000000000001', p, h, 'add', 10, 20);
  ASSERT r->>'status' = 'duplicate' AND (r->>'quantityAfter')::NUMERIC = 20, format('retry result %s', r);
  ASSERT (SELECT quantity FROM holdings WHERE id = h) = 20, 'retry double-applied';

  -- Reusing an operation id for a different change is rejected.
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction('10000000-0000-0000-0000-000000000001', p, h, 'add', 99, 20);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'reused operation id accepted';

  -- Oversell is rejected and changes nothing (no ledger row either).
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction('10000000-0000-0000-0000-000000000002', p, h, 'sell', 21, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'oversell accepted';
  ASSERT (SELECT quantity FROM holdings WHERE id = h) = 20, 'oversell changed quantity';
  ASSERT NOT EXISTS (SELECT 1 FROM holding_transactions WHERE id = '10000000-0000-0000-0000-000000000002'), 'failed op left a ledger row';

  -- Partial sale keeps average cost; selling the rest closes the position.
  r := apply_holding_transaction('10000000-0000-0000-0000-000000000003', p, h, 'sell', 5, NULL);
  ASSERT (r->>'quantityAfter')::NUMERIC = 15 AND (r->>'averageCostAfter')::NUMERIC = 15, format('sell result %s', r);
  r := apply_holding_transaction('10000000-0000-0000-0000-000000000004', p, h, 'sell', 15, NULL);
  ASSERT (r->>'holdingClosed')::BOOLEAN AND NOT EXISTS (SELECT 1 FROM holdings WHERE id = h), 'sell-all did not close';
  ASSERT (SELECT count(*) FROM holding_transactions WHERE portfolio_id = p) = 3, 'ledger should hold 3 applied ops';

  -- Invalid input.
  failed := false;
  BEGIN
    PERFORM apply_holding_transaction('10000000-0000-0000-0000-000000000005', p, '00000000-0000-0000-0000-0000000004c2', 'add', 0, 1);
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'zero quantity accepted';
END $$;
ROLLBACK;

-- 2. Another user cannot change the owner's holding (direct ID substitution).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004b2', true);
DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM apply_holding_transaction('10000000-0000-0000-0000-000000000009',
      '00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-0000000004c2', 'sell', 1, NULL);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  ASSERT failed, 'cross-user change accepted';
END $$;
ROLLBACK;

-- 3. Real concurrency: two sessions, each adding 5 shares to BBB (10 -> 20), and two sessions
--    racing the same operation id on CCC (10 -> 15 exactly once).
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('pf.dblink_host', :'DBLINK_HOST', false);

-- Deterministic interleaving: session A applies inside an open transaction (holding the row lock or
-- the operation-id claim); session B is sent and must be observed blocked; then A commits and B finishes.
CREATE OR REPLACE FUNCTION pg_temp.race(op_a UUID, op_b UUID, holding UUID) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  conn TEXT := format('dbname=postgres user=postgres password=postgres host=%s', current_setting('pf.dblink_host'));
  setup CONSTANT TEXT := 'SET ROLE authenticated; SET request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000004a1''';
  call TEXT := 'SELECT apply_holding_transaction(%L, ''00000000-0000-0000-0000-00000000f401'', %L, ''add'', 5, 10)::text';
  b_result TEXT;
  waited BOOLEAN := false;
BEGIN
  PERFORM dblink_connect('race_a', conn);
  PERFORM dblink_connect('race_b', conn);
  PERFORM dblink_exec('race_a', setup);
  PERFORM dblink_exec('race_b', setup);

  PERFORM dblink_exec('race_a', 'BEGIN');
  PERFORM * FROM dblink('race_a', format(call, op_a, holding)) AS t(x TEXT);

  PERFORM dblink_send_query('race_b', format(call, op_b, holding));
  PERFORM pg_sleep(0.3);
  waited := dblink_is_busy('race_b') = 1;

  PERFORM dblink_exec('race_a', 'COMMIT');
  SELECT x INTO b_result FROM dblink_get_result('race_b') AS t(x TEXT);
  PERFORM * FROM dblink_get_result('race_b') AS t(x TEXT);

  PERFORM dblink_disconnect('race_a');
  PERFORM dblink_disconnect('race_b');
  ASSERT waited, 'session B did not wait for session A';
  RETURN b_result;
END;
$$;

DO $$
DECLARE
  b_result TEXT;
BEGIN
  -- Two different accepted additions of 5 shares to BBB (10): both persist exactly once.
  b_result := pg_temp.race('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
                           '00000000-0000-0000-0000-0000000004c2');
  ASSERT b_result::JSONB->>'status' = 'applied', format('second add result %s', b_result);
  ASSERT (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000004c2') = 20,
    format('concurrent adds lost an update: %s', (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000004c2'));

  -- The same operation id sent from two sessions (double click / retry): applied exactly once.
  b_result := pg_temp.race('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                           '00000000-0000-0000-0000-0000000004c3');
  ASSERT b_result::JSONB->>'status' = 'duplicate', format('second session should get duplicate, got %s', b_result);
  ASSERT (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000004c3') = 15,
    format('duplicate operation applied twice: %s', (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000004c3'));
END $$;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'apply_holding_transaction(uuid,uuid,uuid,text,numeric,numeric)', 'EXECUTE'),
    'anon must not execute apply_holding_transaction';
END $$;
