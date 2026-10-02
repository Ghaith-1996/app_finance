-- Audit J1/J3 migration checks, including the upgrade backfills seeded before 033/034.
BEGIN;
DO $$
BEGIN
  -- 033: USD gets rate 1; CAD stays unknown until refreshed (never assumed 1:1).
  ASSERT (SELECT fx_rate_to_usd FROM holdings WHERE id = '00000000-0000-0000-0000-00000000ac01') = 1, 'USD not backfilled';
  ASSERT (SELECT fx_as_of FROM holdings WHERE id = '00000000-0000-0000-0000-00000000ac01') = '2026-09-30T20:00:00Z', 'fx_as_of not quote time';
  ASSERT (SELECT fx_rate_to_usd FROM holdings WHERE id = '00000000-0000-0000-0000-00000000ac02') IS NULL, 'CAD must not be assumed 1:1';

  -- 034: enriched legacy rows are succeeded, unenriched legacy rows are pending backlog.
  ASSERT (SELECT enrichment_status FROM news_items WHERE id = '00000000-0000-0000-0000-00000000ad01') = 'succeeded', 'legacy enriched row not succeeded';
  ASSERT (SELECT enriched_at FROM news_items WHERE id = '00000000-0000-0000-0000-00000000ad01') IS NOT NULL, 'legacy enriched_at missing';
  ASSERT (SELECT enrichment_status FROM news_items WHERE id = '00000000-0000-0000-0000-00000000ad02') = 'pending', 'legacy unenriched row not pending';

  -- New inserts (e.g. from the Python worker, which does not know these columns) start pending.
  INSERT INTO news_items (id, headline, source, published_at) VALUES
    ('00000000-0000-0000-0000-00000000ad03', 'Fresh', 'Wire', now());
  ASSERT (SELECT enrichment_status FROM news_items WHERE id = '00000000-0000-0000-0000-00000000ad03') = 'pending', 'new row not pending';
END $$;

DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE news_items SET enrichment_status = 'done' WHERE id = '00000000-0000-0000-0000-00000000ad03';
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'unknown enrichment_status accepted';
END $$;
ROLLBACK;
