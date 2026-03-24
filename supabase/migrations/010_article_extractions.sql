-- URL-level cache for article body extraction (newspaper4k). Multiple news_items can share one row.
CREATE TABLE IF NOT EXISTS article_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'complete', 'failed', 'partial')),
  error TEXT,
  extracted_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_extractions_status ON article_extractions (status);
CREATE INDEX IF NOT EXISTS idx_article_extractions_cache_key ON article_extractions (cache_key);

CREATE TRIGGER article_extractions_updated_at
  BEFORE UPDATE ON article_extractions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE article_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read article_extractions"
  ON article_extractions FOR SELECT
  TO authenticated
  USING (true);

-- Service role bypasses RLS for inserts/updates from workers

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS extraction_status TEXT CHECK (
    extraction_status IS NULL OR extraction_status IN (
      'queued', 'in_progress', 'complete', 'failed', 'partial', 'skipped'
    )
  ),
  ADD COLUMN IF NOT EXISTS extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_cache_key TEXT;

CREATE INDEX IF NOT EXISTS idx_news_items_extraction_status ON news_items (extraction_status)
  WHERE extraction_status IS NOT NULL;

COMMENT ON COLUMN news_items.extracted_content IS 'Primary long-body text from publisher extraction (newspaper4k).';
COMMENT ON COLUMN news_items.full_content IS 'Legacy full-text field; prefer extracted_content for new code.';
COMMENT ON TABLE article_extractions IS 'Deduplicated extraction cache by normalized URL; shared across news_items rows.';
