ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS detail_open_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_news_item_detail_open_count(target_news_item_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE news_items
  SET detail_open_count = detail_open_count + 1
  WHERE id = target_news_item_id
  RETURNING detail_open_count INTO updated_count;

  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_news_item_detail_open_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_news_item_detail_open_count(UUID) TO service_role;
