-- Audit B3: price/allocation updates apply atomically; partial refresh never stamps a full sync.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000003a1', 'owner-b3@example.test'),
  ('00000000-0000-0000-0000-0000000003b2', 'other-b3@example.test');

INSERT INTO portfolios (id, user_id, name, last_synced_at) VALUES
  ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-0000000003a1', 'B3', '2026-09-01T00:00:00Z'),
  ('00000000-0000-0000-0000-00000000f302', '00000000-0000-0000-0000-0000000003b2', 'Other', NULL);

INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost, current_price, allocation, quote_currency) VALUES
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-00000000f301', 'AAA', 'A', 'T', 'US', 1, 1, 100, 50, 'USD'),
  ('00000000-0000-0000-0000-0000000003c2', '00000000-0000-0000-0000-00000000f301', 'BBB', 'B', 'T', 'US', 1, 1, 100, 50, 'CAD'),
  ('00000000-0000-0000-0000-0000000003c9', '00000000-0000-0000-0000-00000000f302', 'ZZZ', 'Z', 'T', 'US', 1, 1, 100, 100, 'USD');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);

DO $$
DECLARE
  p CONSTANT UUID := '00000000-0000-0000-0000-00000000f301';
  failed BOOLEAN;
BEGIN
  -- Partial refresh: AAA quoted, BBB keeps last-known price; last_synced_at unchanged, status stale.
  PERFORM apply_holding_price_updates(p,
    '[{"id":"00000000-0000-0000-0000-0000000003c1","allocation":50,"price":101,"previousClose":100,"dailyChange":1,"currency":"USD","quoteAsOf":"2026-10-01T15:00:00Z","fxRateToUsd":1,"fxAsOf":"2026-10-01T15:00:00Z"},
      {"id":"00000000-0000-0000-0000-0000000003c2","allocation":50}]',
    'partial', '2026-10-01T15:00:00Z');
  ASSERT (SELECT last_synced_at FROM portfolios WHERE id = p) = '2026-09-01T00:00:00Z', 'partial refresh stamped a full sync';
  ASSERT (SELECT sync_status::TEXT FROM portfolios WHERE id = p) = 'stale', 'partial refresh not marked stale';
  ASSERT (SELECT current_price FROM holdings WHERE id = '00000000-0000-0000-0000-0000000003c2') = 100, 'unquoted price changed';
  ASSERT (SELECT sum(allocation) FROM holdings WHERE portfolio_id = p) = 100, 'allocations do not sum to 100';
  ASSERT (SELECT previous_close FROM holdings WHERE id = '00000000-0000-0000-0000-0000000003c1') = 100, 'previous close not stored';

  -- A batch containing another portfolio's holding fails as a whole.
  failed := false;
  BEGIN
    PERFORM apply_holding_price_updates(p,
      '[{"id":"00000000-0000-0000-0000-0000000003c1","allocation":0},{"id":"00000000-0000-0000-0000-0000000003c9","allocation":0}]',
      'complete', '2026-10-01T16:00:00Z');
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  ASSERT failed, 'foreign holding id must abort the batch';
  ASSERT (SELECT allocation FROM holdings WHERE id = '00000000-0000-0000-0000-0000000003c1') = 50, 'aborted batch partially applied';

  -- Complete refresh stamps the sync.
  PERFORM apply_holding_price_updates(p,
    '[{"id":"00000000-0000-0000-0000-0000000003c1","allocation":60},{"id":"00000000-0000-0000-0000-0000000003c2","allocation":40}]',
    'complete', '2026-10-01T16:00:00Z');
  ASSERT (SELECT last_synced_at FROM portfolios WHERE id = p) = '2026-10-01T16:00:00Z', 'complete refresh not stamped';
  ASSERT (SELECT sync_status::TEXT FROM portfolios WHERE id = p) = 'active', 'complete refresh not active';

  -- Cross-user portfolio is rejected.
  failed := false;
  BEGIN
    PERFORM apply_holding_price_updates('00000000-0000-0000-0000-00000000f302',
      '[{"id":"00000000-0000-0000-0000-0000000003c9","allocation":0}]', 'complete', now());
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  ASSERT failed, 'cross-user price update must be rejected';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  ASSERT (SELECT allocation FROM holdings WHERE id = '00000000-0000-0000-0000-0000000003c9') = 100, 'other user holding changed';
  ASSERT NOT has_function_privilege('anon', 'apply_holding_price_updates(uuid,jsonb,text,timestamptz)', 'EXECUTE'),
    'anon must not execute apply_holding_price_updates';
END $$;

-- Service role (cron) may update without a user session.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM apply_holding_price_updates('00000000-0000-0000-0000-00000000f302',
    '[{"id":"00000000-0000-0000-0000-0000000003c9","allocation":100}]', 'complete', '2026-10-01T17:00:00Z');
  ASSERT (SELECT last_synced_at FROM portfolios WHERE id = '00000000-0000-0000-0000-00000000f302') = '2026-10-01T17:00:00Z',
    'service role update failed';
END $$;

ROLLBACK;
