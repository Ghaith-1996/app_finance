-- Review follow-up to 039: two different operation ids on the same holding serialize instead of
-- deadlocking. The ledger insert's foreign-key check takes a key-share lock on the holding; 039 took
-- it before the holding's FOR UPDATE, so two sessions could each hold key-share and wait on the other.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000043a1', 'owner-043@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000f431', '00000000-0000-0000-0000-0000000043a1', 'B4 lock order');
INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost) VALUES
  ('00000000-0000-0000-0000-0000000043c1', '00000000-0000-0000-0000-00000000f431', 'DDD', 'D', 'T', 'US', 10, 10);

CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('pf.dblink_host', :'DBLINK_HOST', false);

DO $$
DECLARE
  conn TEXT := format('dbname=postgres user=postgres password=postgres host=%s', current_setting('pf.dblink_host'));
  holding CONSTANT UUID := '00000000-0000-0000-0000-0000000043c1';
  b_pid INT;
  b_result TEXT;
  waited BOOLEAN;
  b_wrote_ledger_early BOOLEAN;
BEGIN
  PERFORM dblink_connect('lock_a', conn);
  PERFORM dblink_connect('lock_b', conn);
  PERFORM dblink_exec('lock_b', 'SET ROLE authenticated; SET request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000043a1''');
  SELECT pid INTO b_pid FROM dblink('lock_b', 'SELECT pg_backend_pid()') AS t(pid INT);

  -- Session A holds the key-share lock a concurrent ledger insert would hold on the holding.
  PERFORM dblink_exec('lock_a', 'BEGIN');
  PERFORM * FROM dblink('lock_a', format('SELECT 1 FROM holdings WHERE id = %L FOR KEY SHARE', holding)) AS t(x INT);

  PERFORM dblink_send_query('lock_b', format(
    'SELECT apply_holding_transaction(%L, ''00000000-0000-0000-0000-00000000f431'', %L, ''add'', 5, 10)::text',
    '43000000-0000-0000-0000-000000000001', holding));
  PERFORM pg_sleep(0.3);
  waited := dblink_is_busy('lock_b') = 1;

  -- B must wait for the holding row lock before writing its ledger row: an insert would already hold
  -- RowExclusiveLock on holding_transactions (and the key-share lock that completes the deadlock).
  b_wrote_ledger_early := EXISTS (
    SELECT 1 FROM pg_locks
    WHERE pid = b_pid AND relation = 'public.holding_transactions'::regclass AND mode = 'RowExclusiveLock'
  );

  PERFORM dblink_exec('lock_a', 'COMMIT');
  SELECT x INTO b_result FROM dblink_get_result('lock_b') AS t(x TEXT);
  PERFORM * FROM dblink_get_result('lock_b') AS t(x TEXT);
  PERFORM dblink_disconnect('lock_a');
  PERFORM dblink_disconnect('lock_b');

  ASSERT waited, 'session B did not wait for the holding row lock';
  ASSERT NOT b_wrote_ledger_early, 'ledger row written before the holding row lock (FK lock taken first)';
  ASSERT b_result::JSONB->>'status' = 'applied', format('B result %s', b_result);
  ASSERT (SELECT quantity FROM holdings WHERE id = holding) = 15, 'B change not applied exactly once';
END $$;
