-- Review follow-up: the analysis cron's target discovery and job health need each portfolio's newest
-- usable run (complete or degraded). Reading every usable run and reducing in the app grows with run
-- history; this returns one row per portfolio, each found by a LIMIT 1 probe of a partial index, so
-- the cost follows the portfolio count rather than the history size.

CREATE INDEX IF NOT EXISTS idx_analysis_runs_usable_latest
  ON analysis_runs (portfolio_id, completed_at DESC)
  WHERE status IN ('complete', 'degraded') AND completed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.latest_usable_analysis_runs()
RETURNS TABLE (portfolio_id UUID, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id, latest.started_at, latest.completed_at
  FROM portfolios p
  CROSS JOIN LATERAL (
    SELECT r.started_at, r.completed_at
    FROM analysis_runs r
    WHERE r.portfolio_id = p.id
      AND r.status IN ('complete', 'degraded')
      AND r.completed_at IS NOT NULL
    ORDER BY r.completed_at DESC
    LIMIT 1
  ) latest
  ORDER BY p.id;
$$;

-- Server jobs only (service role); it reads across every user's portfolios.
REVOKE ALL ON FUNCTION public.latest_usable_analysis_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.latest_usable_analysis_runs() TO service_role;
