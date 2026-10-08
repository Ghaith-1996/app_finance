-- Audit J1/J3: durable, retryable enrichment state for news_items.
--
-- enrichment_status   pending   inserted, never attempted
--                     retrying  a transient AI/provider failure; retried after enrichment_next_attempt_at
--                     succeeded AI enrichment stored (the only state analysis treats as precomputed)
--                     failed    attempts exhausted; fallback display text may be stored, never "succeeded"
-- Work is selected from this state, not from the IDs a single ingest run happened to insert, so an
-- article inserted before a crash is still found by the next run even if no new articles arrive.

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_last_error TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_items_enrichment_status_check'
  ) THEN
    ALTER TABLE news_items
      ADD CONSTRAINT news_items_enrichment_status_check
      CHECK (enrichment_status IN ('pending', 'retrying', 'succeeded', 'failed'));
  END IF;
END $$;

-- Rows enriched before this migration keep their existing summaries. Fallback summaries written by
-- the old code cannot be told apart from real ones, so they are not re-queued here.
UPDATE news_items
SET enrichment_status = 'succeeded',
    enriched_at = coalesce(enriched_at, created_at)
WHERE global_summary IS NOT NULL AND enrichment_status = 'pending';

CREATE INDEX IF NOT EXISTS news_items_enrichment_backlog_idx
  ON news_items (enrichment_next_attempt_at NULLS FIRST, published_at DESC)
  WHERE enrichment_status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS news_items_enriched_at_idx
  ON news_items (enriched_at DESC)
  WHERE enrichment_status = 'succeeded';
