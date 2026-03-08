-- PortfolioSignal initial schema with RLS
-- Run this in Supabase SQL Editor or via Supabase CLI: supabase db push

-- Enums
CREATE TYPE source_type AS ENUM ('manual', 'wealthsimple', 'interactive_brokers', 'demo');
CREATE TYPE sync_status AS ENUM ('active', 'stale', 'failed');
CREATE TYPE analysis_status AS ENUM (
  'queued',
  'processing_holdings',
  'mapping_news',
  'generating_insights',
  'complete',
  'failed'
);
CREATE TYPE sentiment_type AS ENUM ('positive', 'watch', 'negative', 'neutral');
CREATE TYPE impact_level AS ENUM ('High', 'Medium', 'Low');

-- portfolios: one per user
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Portfolio',
  source_type source_type NOT NULL DEFAULT 'manual',
  sync_status sync_status NOT NULL DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- holdings: positions within a portfolio
CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  company TEXT NOT NULL,
  sector TEXT NOT NULL,
  market TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Manual',
  price DECIMAL(18, 4) NOT NULL DEFAULT 0,
  daily_change DECIMAL(8, 2) NOT NULL DEFAULT 0,
  allocation DECIMAL(5, 2) NOT NULL DEFAULT 0,
  thesis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- analysis_runs: pipeline execution tracking
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  status analysis_status NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- news_items: global ingested news (no user_id)
CREATE TABLE news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  angle TEXT,
  raw_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- feed_items: portfolio-specific scored news
CREATE TABLE feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  relevance_score INT NOT NULL DEFAULT 0,
  sentiment sentiment_type NOT NULL DEFAULT 'neutral',
  impact impact_level NOT NULL DEFAULT 'Low',
  holdings TEXT[] NOT NULL DEFAULT '{}',
  sectors TEXT[] NOT NULL DEFAULT '{}',
  ai_summary TEXT,
  why_it_matters TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- portfolio_insights: AI-generated insights per run
CREATE TABLE portfolio_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX idx_analysis_runs_portfolio_id ON analysis_runs(portfolio_id);
CREATE INDEX idx_analysis_runs_status ON analysis_runs(status);
CREATE INDEX idx_news_items_published_at ON news_items(published_at DESC);
CREATE INDEX idx_feed_items_portfolio_id ON feed_items(portfolio_id);
CREATE INDEX idx_feed_items_analysis_run_id ON feed_items(analysis_run_id);
CREATE INDEX idx_portfolio_insights_portfolio_id ON portfolio_insights(portfolio_id);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_insights ENABLE ROW LEVEL SECURITY;

-- portfolios: user can only access their own
CREATE POLICY "Users can manage own portfolios"
  ON portfolios FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- holdings: via portfolio ownership
CREATE POLICY "Users can manage holdings of own portfolios"
  ON holdings FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- analysis_runs: via portfolio ownership
CREATE POLICY "Users can manage analysis_runs of own portfolios"
  ON analysis_runs FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- news_items: authenticated users can read; insert/update/delete via service role or allow authenticated for cron
CREATE POLICY "Authenticated users can read news_items"
  ON news_items FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Authenticated users can insert news_items"
  ON news_items FOR INSERT
  TO authenticated
  WITH CHECK (true);
CREATE POLICY "Authenticated users can update news_items"
  ON news_items FOR UPDATE
  TO authenticated
  USING (true);

-- feed_items: via portfolio ownership
CREATE POLICY "Users can manage feed_items of own portfolios"
  ON feed_items FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- portfolio_insights: via portfolio ownership
CREATE POLICY "Users can manage portfolio_insights of own portfolios"
  ON portfolio_insights FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- Realtime: enable for analysis_runs and feed_items so UI can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE analysis_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE feed_items;
