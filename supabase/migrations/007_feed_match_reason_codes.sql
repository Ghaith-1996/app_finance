ALTER TABLE feed_items
  ADD COLUMN IF NOT EXISTS match_reason_codes TEXT[] NULL;
