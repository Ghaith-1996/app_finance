CREATE TABLE watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  exchange TEXT NOT NULL DEFAULT '',
  price DECIMAL(18, 4) NOT NULL DEFAULT 0,
  day_change DECIMAL(8, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX idx_watchlist_items_user_id ON watchlist_items(user_id);

CREATE TRIGGER watchlist_items_updated_at
  BEFORE UPDATE ON watchlist_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watchlist items"
  ON watchlist_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
