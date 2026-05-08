CREATE TABLE user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  phone_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_notification_preferences_phone_number_check
    CHECK (
      phone_number IS NULL
      OR phone_number ~ '^\+[1-9][0-9]{7,14}$'
    )
);

CREATE TABLE notification_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'America/New_York',
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  source_mode TEXT NOT NULL
    CHECK (source_mode IN ('portfolio', 'watchlist')),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
  portfolio_name TEXT,
  summary_line TEXT NOT NULL,
  bullish_symbols TEXT[] NOT NULL DEFAULT '{}',
  bearish_symbols TEXT[] NOT NULL DEFAULT '{}',
  top_stories JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(top_stories) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_digests_user_date_unique UNIQUE (user_id, digest_date)
);

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id UUID NOT NULL REFERENCES notification_digests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'skipped', 'failed', 'uncertain')),
  provider_message_id TEXT,
  error_text TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_digest_channel_unique UNIQUE (digest_id, channel)
);

CREATE INDEX idx_notification_digests_user_date
  ON notification_digests(user_id, digest_date DESC);

CREATE INDEX idx_notification_deliveries_digest_id
  ON notification_deliveries(digest_id);

CREATE TRIGGER user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER notification_deliveries_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification preferences"
  ON user_notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own notification digests"
  ON notification_digests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
