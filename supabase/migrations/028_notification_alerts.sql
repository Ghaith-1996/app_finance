CREATE TABLE IF NOT EXISTS notification_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (
    alert_type IN (
      'critical_news',
      'earnings_report',
      'price_move',
      'concentration'
    )
  ),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_href TEXT NOT NULL,
  source_table TEXT,
  source_id TEXT,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_alerts_user_type_dedupe_unique
    UNIQUE (user_id, alert_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_alerts_user_created
  ON notification_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_alerts_user_unread
  ON notification_alerts(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_alerts_portfolio_created
  ON notification_alerts(portfolio_id, created_at DESC)
  WHERE portfolio_id IS NOT NULL;

ALTER TABLE notification_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notification alerts"
  ON notification_alerts;

CREATE POLICY "Users can read own notification alerts"
  ON notification_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON notification_alerts TO authenticated;
GRANT ALL ON notification_alerts TO service_role;

COMMENT ON TABLE notification_alerts IS
  'Deduplicated smart alert events generated from user notification preferences.';
COMMENT ON COLUMN notification_alerts.dedupe_key IS
  'Stable rule-specific key used to prevent duplicate alert rows.';
COMMENT ON COLUMN notification_alerts.action_href IS
  'Internal app link users can open to inspect the alert context.';
