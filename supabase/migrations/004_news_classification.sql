-- AI news classification: enrich news_items globally, link to portfolios via stock tags

-- news_items: add global AI enrichment columns
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS category        TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS stock_tags      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS global_summary  TEXT,
  ADD COLUMN IF NOT EXISTS overall_effect  TEXT NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS ticker_impacts  JSONB NOT NULL DEFAULT '[]';

-- feed_items: add stock-tag matching and display effect
ALTER TABLE feed_items
  ADD COLUMN IF NOT EXISTS matched_stock_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_effect     TEXT NOT NULL DEFAULT 'neutral';

-- Indexes for array-contains queries
CREATE INDEX IF NOT EXISTS idx_news_items_stock_tags
  ON news_items USING GIN (stock_tags);
CREATE INDEX IF NOT EXISTS idx_feed_items_matched_stock_tags
  ON feed_items USING GIN (matched_stock_tags);
CREATE INDEX IF NOT EXISTS idx_news_items_category
  ON news_items (category);
