-- Add a heartbeat timestamp to analysis_runs so stale-run recovery can tell
-- the difference between an orphaned lock and a legitimately long-running job.

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE analysis_runs
   SET updated_at = COALESCE(completed_at, started_at, created_at, now())
 WHERE updated_at IS NULL;

ALTER TABLE analysis_runs
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS analysis_runs_updated_at ON analysis_runs;

CREATE TRIGGER analysis_runs_updated_at
  BEFORE UPDATE ON analysis_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
