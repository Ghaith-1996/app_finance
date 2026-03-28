-- Remove broad authenticated write access to global news_items.
-- Service-role ingestion paths remain unaffected because the service role bypasses RLS.

DROP POLICY IF EXISTS "Authenticated users can insert news_items" ON news_items;
DROP POLICY IF EXISTS "Authenticated users can update news_items" ON news_items;
