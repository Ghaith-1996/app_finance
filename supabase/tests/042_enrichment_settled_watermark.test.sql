-- Review P1: terminal enrichment failures carry a settle stamp, so the analysis watermark sees them.
BEGIN;
DO $$
BEGIN
  ASSERT (SELECT enriched_at FROM news_items WHERE id = '00000000-0000-0000-0000-0000000042a1')
    = '2026-10-05T12:01:00Z', 'legacy failed row not stamped with its creation time';
  ASSERT (SELECT enrichment_status FROM news_items WHERE id = '00000000-0000-0000-0000-0000000042a1')
    = 'failed', 'backfill must not change the status';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'news_items_settled_at_idx'),
    'settled watermark index missing';
END $$;
ROLLBACK;
