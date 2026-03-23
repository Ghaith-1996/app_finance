-- Add full_content column for extracted article body text
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS full_content TEXT;

COMMENT ON COLUMN news_items.full_content IS
  'Full article body extracted from publisher URL via newspaper3k. NULL if extraction failed or not yet attempted.';
