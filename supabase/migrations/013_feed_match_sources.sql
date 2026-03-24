ALTER TABLE feed_items
  ADD COLUMN IF NOT EXISTS match_sources TEXT[] NULL;

COMMENT ON COLUMN feed_items.match_sources IS
  'Which user asset sets matched this article: portfolio, watchlist, or both.';
