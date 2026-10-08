-- Audit B1 acceptance: failed replace/merge keeps prior holdings; no partial apply; ownership enforced.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'owner-b1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'other-b1@example.test');

INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 'Owner portfolio');

INSERT INTO holdings (portfolio_id, symbol, company, sector, market, quantity, average_cost) VALUES
  ('00000000-0000-0000-0000-00000000f001', 'AAA', 'Aaa Corp', 'Tech', 'US', 10, 100),
  ('00000000-0000-0000-0000-00000000f001', 'BBB', 'Bbb Corp', 'Tech', 'US', 5, 50);

-- Test-only fault injection: any write of symbol FAIL errors like a storage failure would.
CREATE FUNCTION pg_temp.inject_holding_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.symbol = 'FAIL' THEN
    RAISE EXCEPTION 'Simulated storage failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inject_holding_failure BEFORE INSERT OR UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_holding_failure();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

DO $$
DECLARE
  p CONSTANT UUID := '00000000-0000-0000-0000-00000000f001';
  failed BOOLEAN;
  msg TEXT;
  snapshot_before TEXT;
  snapshot_after TEXT;
  new_portfolio UUID;
BEGIN
  SELECT string_agg(symbol || ':' || quantity || ':' || average_cost, ',' ORDER BY symbol)
    INTO snapshot_before FROM holdings WHERE portfolio_id = p;

  -- 1. Replace whose insert fails mid-way: previous holdings survive byte-for-byte.
  failed := false;
  BEGIN
    PERFORM save_portfolio_holdings(p, NULL, NULL, 'replace',
      '[{"symbol":"CCC","quantity":1,"averageCost":1},{"symbol":"FAIL","quantity":1,"averageCost":1}]');
  EXCEPTION WHEN OTHERS THEN failed := true; msg := SQLERRM;
  END;
  ASSERT failed, 'replace with failing insert must raise';
  SELECT string_agg(symbol || ':' || quantity || ':' || average_cost, ',' ORDER BY symbol)
    INTO snapshot_after FROM holdings WHERE portfolio_id = p;
  ASSERT snapshot_after = snapshot_before, format('replace failure changed holdings: %s', snapshot_after);

  -- 2. Merge that updates AAA then fails: AAA must still be 10.
  failed := false;
  BEGIN
    PERFORM save_portfolio_holdings(p, NULL, NULL, 'merge',
      '[{"symbol":"AAA","quantity":99,"averageCost":100},{"symbol":"FAIL","quantity":1,"averageCost":1}]');
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  ASSERT failed, 'merge with failing write must raise';
  ASSERT (SELECT quantity FROM holdings WHERE portfolio_id = p AND symbol = 'AAA') = 10,
    'failed merge partially applied';

  -- 3. Malformed input is rejected before mutation.
  FOREACH msg IN ARRAY ARRAY[
    '[]',
    '{"symbol":"AAA"}',
    '[{"symbol":"","quantity":1,"averageCost":1}]',
    '[{"symbol":"AAA","quantity":"10","averageCost":1}]',
    '[{"symbol":"AAA","quantity":0,"averageCost":1}]',
    '[{"symbol":"AAA","quantity":-5,"averageCost":1}]',
    '[{"symbol":"AAA","quantity":1,"averageCost":-1}]',
    '[{"symbol":"AAA","quantity":1e13,"averageCost":1}]',
    '[{"symbol":"AAA","quantity":1,"averageCost":1},{"symbol":"aaa","quantity":2,"averageCost":1}]',
    '[{"symbol":"AAA","quantity":1,"averageCost":1,"importSource":"broker"}]'
  ] LOOP
    failed := false;
    BEGIN
      PERFORM save_portfolio_holdings(p, NULL, NULL, 'replace', msg::JSONB);
    EXCEPTION WHEN invalid_parameter_value THEN failed := true;
    END;
    ASSERT failed, format('malformed payload accepted: %s', msg);
  END LOOP;
  SELECT string_agg(symbol || ':' || quantity || ':' || average_cost, ',' ORDER BY symbol)
    INTO snapshot_after FROM holdings WHERE portfolio_id = p;
  ASSERT snapshot_after = snapshot_before, 'rejected payload changed holdings';

  -- 4. Successful merge updates existing and inserts new, case-insensitively.
  PERFORM save_portfolio_holdings(p, NULL, 'csv', 'merge',
    '[{"symbol":"aaa","quantity":12,"averageCost":101,"importSource":"csv"},{"symbol":"DDD","quantity":3,"averageCost":30}]');
  ASSERT (SELECT quantity FROM holdings WHERE portfolio_id = p AND symbol = 'AAA') = 12, 'merge update missing';
  ASSERT (SELECT count(*) FROM holdings WHERE portfolio_id = p) = 3, 'merge insert missing';
  ASSERT (SELECT source_type::TEXT FROM portfolios WHERE id = p) = 'csv', 'source type not updated';

  -- 5. Retrying the same merge is idempotent (same end state, no duplicates).
  PERFORM save_portfolio_holdings(p, NULL, 'csv', 'merge',
    '[{"symbol":"aaa","quantity":12,"averageCost":101,"importSource":"csv"},{"symbol":"DDD","quantity":3,"averageCost":30}]');
  ASSERT (SELECT count(*) FROM holdings WHERE portfolio_id = p) = 3, 'merge retry duplicated rows';

  -- 6. Successful replace leaves exactly the new set.
  PERFORM save_portfolio_holdings(p, NULL, NULL, 'replace', '[{"symbol":"EEE","quantity":4,"averageCost":40}]');
  ASSERT (SELECT string_agg(symbol, ',') FROM holdings WHERE portfolio_id = p) = 'EEE', 'replace result wrong';

  -- 7. New portfolio creation is part of the same transaction.
  failed := false;
  BEGIN
    PERFORM save_portfolio_holdings(NULL, 'Ghost', NULL, 'replace', '[{"symbol":"FAIL","quantity":1,"averageCost":1}]');
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  ASSERT failed AND NOT EXISTS (SELECT 1 FROM portfolios WHERE name = 'Ghost'), 'failed create left an orphan portfolio';
  new_portfolio := save_portfolio_holdings(NULL, 'Fresh', 'manual', 'replace', '[{"symbol":"FFF","quantity":1,"averageCost":1}]');
  ASSERT (SELECT user_id FROM portfolios WHERE id = new_portfolio) = '00000000-0000-0000-0000-0000000000a1', 'new portfolio owner wrong';
END $$;

-- 8. Another user cannot write into the owner's portfolio (direct ID substitution).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM save_portfolio_holdings('00000000-0000-0000-0000-00000000f001', NULL, NULL, 'replace',
      '[{"symbol":"HACK","quantity":1,"averageCost":1}]');
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  ASSERT failed, 'cross-user save must be rejected';
END $$;

-- 9. Anonymous callers have no execute grant.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'save_portfolio_holdings(uuid,text,text,text,jsonb)', 'EXECUTE'),
    'anon must not execute save_portfolio_holdings';
  ASSERT (SELECT string_agg(symbol, ',') FROM holdings WHERE portfolio_id = '00000000-0000-0000-0000-00000000f001') = 'EEE',
    'cross-user attempt modified holdings';
END $$;

ROLLBACK;
