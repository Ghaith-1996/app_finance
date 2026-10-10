-- Review P2: two different operations on the same holding must serialize, not deadlock. Before 043
-- each call took the ledger row's foreign-key KEY SHARE lock on the holding before its FOR UPDATE,
-- so two calls that both inserted first then waited for each other's KEY SHARE lock.
--
-- Deterministic interleaving with real sessions (dblink): session C holds FOR NO KEY UPDATE on the
-- holding (compatible with KEY SHARE, not with FOR UPDATE), so A and B both get as far as their
-- first conflicting lock before C releases it.

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000043a1', 'owner-043@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-0000000043f1', '00000000-0000-0000-0000-0000000043a1', 'Lock order 043');
INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost) VALUES
  ('00000000-0000-0000-0000-0000000043c1', '00000000-0000-0000-0000-0000000043f1', 'DDD', 'D', 'T', 'US', 10, 10),
  ('00000000-0000-0000-0000-0000000043c2', '00000000-0000-0000-0000-0000000043f1', 'EEE', 'E', 'T', 'US', 10, 10);

CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('pf.dblink_host', :'DBLINK_HOST', false);

-- Returns the two results (or error messages) of A and B.
CREATE OR REPLACE FUNCTION pg_temp.gated_race(op_a UUID, op_b UUID, holding UUID, kind TEXT, quantity NUMERIC)
RETURNS TEXT[]
LANGUAGE plpgsql AS $$
DECLARE
  conn TEXT := format('dbname=postgres user=postgres password=postgres host=%s', current_setting('pf.dblink_host'));
  setup CONSTANT TEXT := 'SET ROLE authenticated; SET request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000043a1''';
  call CONSTANT TEXT := 'SELECT apply_holding_transaction(%L, ''00000000-0000-0000-0000-0000000043f1'', %L, %L, %s, %s)::text';
  price TEXT := CASE WHEN kind = 'add' THEN '10' ELSE 'NULL' END;
  results TEXT[] := ARRAY[]::TEXT[];
  name TEXT;
  value TEXT;
BEGIN
  PERFORM dblink_connect('gate_c', conn);
  PERFORM dblink_connect('gate_a', conn);
  PERFORM dblink_connect('gate_b', conn);
  PERFORM dblink_exec('gate_a', setup);
  PERFORM dblink_exec('gate_b', setup);

  PERFORM dblink_exec('gate_c', 'BEGIN');
  PERFORM * FROM dblink('gate_c', format('SELECT id FROM holdings WHERE id = %L FOR NO KEY UPDATE', holding)) AS t(id UUID);

  PERFORM dblink_send_query('gate_a', format(call, op_a, holding, kind, quantity, price));
  PERFORM dblink_send_query('gate_b', format(call, op_b, holding, kind, quantity, price));
  PERFORM pg_sleep(0.3);
  ASSERT dblink_is_busy('gate_a') = 1 AND dblink_is_busy('gate_b') = 1, 'A and B should both wait on C';

  PERFORM dblink_exec('gate_c', 'COMMIT');
  FOREACH name IN ARRAY ARRAY['gate_a', 'gate_b'] LOOP
    BEGIN
      SELECT x INTO value FROM dblink_get_result(name) AS t(x TEXT);
      PERFORM * FROM dblink_get_result(name) AS t(x TEXT);
    EXCEPTION WHEN OTHERS THEN
      value := 'ERROR: ' || SQLERRM;
    END;
    results := results || value;
  END LOOP;

  PERFORM dblink_disconnect('gate_a');
  PERFORM dblink_disconnect('gate_b');
  PERFORM dblink_disconnect('gate_c');
  RETURN results;
END;
$$;

DO $$
DECLARE
  r TEXT[];
BEGIN
  -- Two different additions of 5 shares: both are applied, one after the other.
  r := pg_temp.gated_race('43000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000002',
                          '00000000-0000-0000-0000-0000000043c1', 'add', 5);
  ASSERT r[1] NOT LIKE 'ERROR:%' AND r[2] NOT LIKE 'ERROR:%', format('concurrent adds failed: %s', r);
  ASSERT (r[1]::JSONB->>'status') = 'applied' AND (r[2]::JSONB->>'status') = 'applied', format('results %s', r);
  ASSERT (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000043c1') = 20,
    format('expected 20 shares, got %s', (SELECT quantity FROM holdings WHERE id = '00000000-0000-0000-0000-0000000043c1'));

  -- The same sell-all sent twice: the second call finds the holding gone and still reports the
  -- original outcome as a duplicate.
  r := pg_temp.gated_race('43000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000003',
                          '00000000-0000-0000-0000-0000000043c2', 'sell', 10);
  ASSERT r[1] NOT LIKE 'ERROR:%' AND r[2] NOT LIKE 'ERROR:%', format('concurrent sell-all failed: %s', r);
  ASSERT (SELECT array_agg(x::JSONB->>'status' ORDER BY x::JSONB->>'status') FROM unnest(r) AS x)
    = ARRAY['applied', 'duplicate'], format('results %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM holdings WHERE id = '00000000-0000-0000-0000-0000000043c2'), 'sell-all did not close';
  ASSERT (SELECT count(*) FROM holding_transactions WHERE id = '43000000-0000-0000-0000-000000000003') = 1,
    'sell-all recorded twice';
END $$;
