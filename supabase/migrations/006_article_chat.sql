-- Per-user, per-portfolio article chat persistence

CREATE TABLE IF NOT EXISTS article_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS article_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES article_chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_article_chat_threads_user_portfolio_news
  ON article_chat_threads(user_id, portfolio_id, news_item_id);

CREATE INDEX IF NOT EXISTS idx_article_chat_messages_thread_created
  ON article_chat_messages(thread_id, created_at);

CREATE TRIGGER article_chat_threads_updated_at
  BEFORE UPDATE ON article_chat_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE article_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own article chat threads"
  ON article_chat_threads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own article chat messages"
  ON article_chat_messages FOR ALL
  USING (
    thread_id IN (
      SELECT id FROM article_chat_threads WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    thread_id IN (
      SELECT id FROM article_chat_threads WHERE user_id = auth.uid()
    )
  );
