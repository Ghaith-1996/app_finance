DROP POLICY IF EXISTS "Users can mark own notification alerts read"
  ON notification_alerts;

CREATE POLICY "Users can mark own notification alerts read"
  ON notification_alerts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE (read_at) ON notification_alerts TO authenticated;

CREATE TABLE IF NOT EXISTS user_saved_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_articles_user_news_unique
    UNIQUE (user_id, news_item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_articles_user_saved
  ON user_saved_articles(user_id, saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_saved_articles_news
  ON user_saved_articles(news_item_id);

ALTER TABLE user_saved_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own saved articles"
  ON user_saved_articles;

CREATE POLICY "Users can read own saved articles"
  ON user_saved_articles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save own articles"
  ON user_saved_articles;

CREATE POLICY "Users can save own articles"
  ON user_saved_articles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved articles"
  ON user_saved_articles;

CREATE POLICY "Users can delete own saved articles"
  ON user_saved_articles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON user_saved_articles TO authenticated;
GRANT ALL ON user_saved_articles TO service_role;

COMMENT ON TABLE user_saved_articles IS
  'Per-user reading list for news articles saved from the feed.';
COMMENT ON COLUMN user_saved_articles.news_item_id IS
  'References the shared global news item saved by the user.';
