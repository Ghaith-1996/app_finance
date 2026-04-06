-- Backfill legacy Stripe processing rows created before processed_at started
-- tracking claim time. This allows stale-processing recovery logic to reclaim
-- rows after the configured timeout instead of leaving them wedged forever.

UPDATE billing_events
   SET processed_at = now()
 WHERE processing_state IN ('processing', 'failed')
   AND processed_at IS NULL;
