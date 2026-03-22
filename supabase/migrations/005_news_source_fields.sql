-- Add source-aware ingestion fields to news_items
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS source_type    TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS category_hint  TEXT,
  ADD COLUMN IF NOT EXISTS metadata       JSONB NOT NULL DEFAULT '{}';

-- Unique dedupe index: (source_type, external_id) when external_id is present
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_source_external
  ON news_items (source_type, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_source_type
  ON news_items (source_type);

-- Add source confidence tracking to feed_items for ranking
ALTER TABLE feed_items
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN news_items.source_type IS
  'Origin of the article: edgar | yfinance | marketaux | seed | other';
COMMENT ON COLUMN news_items.external_id IS
  'Provider-assigned dedup key (e.g. edgar_<accession>, yf_<uuid>)';
COMMENT ON COLUMN news_items.category_hint IS
  'Pre-AI category guess from the provider (e.g. earnings, regulation, deals)';
COMMENT ON COLUMN news_items.metadata IS
  'Source-specific details: edgar={filing_type,accession_no,cik,company_name}, yfinance={publisher,related_tickers}';
COMMENT ON COLUMN feed_items.source_confidence IS
  'Ranking tier: high (edgar filing-backed) | standard (headline-only)';
