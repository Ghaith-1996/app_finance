-- Review P1: the analysis cron decides whether a portfolio has new work from the newest settled
-- enrichment. A terminal failure carries fallback text that analysis can still match, so it counts
-- as settled work; otherwise an article that exhausts its retries during a provider outage never
-- reaches a personalised feed.
--
-- enriched_at now means "time enrichment settled" for both succeeded and failed rows; the status
-- (never this timestamp) says whether AI enrichment is real. Failed rows written before this change
-- have no stamp: use their creation time, the earliest moment they could have settled.

UPDATE news_items
SET enriched_at = created_at
WHERE enrichment_status = 'failed' AND enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS news_items_settled_at_idx
  ON news_items (enriched_at DESC)
  WHERE enrichment_status IN ('succeeded', 'failed');
