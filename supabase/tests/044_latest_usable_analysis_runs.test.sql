-- Review: the analysis cron and job health read one latest usable run per portfolio, not every
-- historical run. Usable means complete or degraded with a completion time.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000044a1', 'owner-044@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000f441', '00000000-0000-0000-0000-0000000044a1', 'Has history'),
  ('00000000-0000-0000-0000-00000000f442', '00000000-0000-0000-0000-0000000044a1', 'Only failed'),
  ('00000000-0000-0000-0000-00000000f443', '00000000-0000-0000-0000-0000000044a1', 'Never ran');
INSERT INTO analysis_runs (portfolio_id, status, started_at, completed_at) VALUES
  ('00000000-0000-0000-0000-00000000f441', 'complete', '2026-10-01T09:00:00Z', '2026-10-01T09:05:00Z'),
  ('00000000-0000-0000-0000-00000000f441', 'degraded', '2026-10-01T11:00:00Z', '2026-10-01T11:05:00Z'),
  ('00000000-0000-0000-0000-00000000f441', 'failed', '2026-10-01T12:00:00Z', '2026-10-01T12:05:00Z'),
  ('00000000-0000-0000-0000-00000000f441', 'mapping_news', '2026-10-01T13:00:00Z', NULL),
  ('00000000-0000-0000-0000-00000000f442', 'failed', '2026-10-01T12:00:00Z', '2026-10-01T12:05:00Z');

DO $$
DECLARE
  history CONSTANT UUID := '00000000-0000-0000-0000-00000000f441';
  mine CONSTANT UUID[] := ARRAY[
    '00000000-0000-0000-0000-00000000f441',
    '00000000-0000-0000-0000-00000000f442',
    '00000000-0000-0000-0000-00000000f443'
  ]::UUID[];
BEGIN
  ASSERT (SELECT count(*) FROM latest_usable_analysis_runs() WHERE portfolio_id = ANY (mine)) = 1,
    'expected exactly one row: the portfolio with a usable run';
  ASSERT (SELECT completed_at FROM latest_usable_analysis_runs() WHERE portfolio_id = history)
    = '2026-10-01T11:05:00Z', 'newest usable (degraded) run not selected over older complete / newer failed';
  ASSERT (SELECT started_at FROM latest_usable_analysis_runs() WHERE portfolio_id = history)
    = '2026-10-01T11:00:00Z', 'started_at must come from the same run';
  ASSERT (SELECT count(*) FROM latest_usable_analysis_runs())
    = (SELECT count(DISTINCT portfolio_id) FROM latest_usable_analysis_runs()), 'more than one row per portfolio';

  ASSERT NOT has_function_privilege('anon', 'latest_usable_analysis_runs()', 'EXECUTE'), 'anon can execute';
  ASSERT NOT has_function_privilege('authenticated', 'latest_usable_analysis_runs()', 'EXECUTE'), 'authenticated can execute';
  ASSERT has_function_privilege('service_role', 'latest_usable_analysis_runs()', 'EXECUTE'), 'service_role cannot execute';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_runs_usable_latest'), 'latest-run index missing';
END $$;
