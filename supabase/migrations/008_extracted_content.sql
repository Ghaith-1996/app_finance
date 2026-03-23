ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS extracted_content TEXT;
