ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS critical_news_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS earnings_report_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_move_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_move_threshold_percent DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS concentration_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS concentration_threshold_percent DECIMAL(5, 2) NOT NULL DEFAULT 35.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_notification_preferences_price_move_threshold_check'
  ) THEN
    ALTER TABLE user_notification_preferences
      ADD CONSTRAINT user_notification_preferences_price_move_threshold_check
      CHECK (
        price_move_threshold_percent >= 1
        AND price_move_threshold_percent <= 50
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_notification_preferences_concentration_threshold_check'
  ) THEN
    ALTER TABLE user_notification_preferences
      ADD CONSTRAINT user_notification_preferences_concentration_threshold_check
      CHECK (
        concentration_threshold_percent >= 10
        AND concentration_threshold_percent <= 90
      );
  END IF;
END $$;

COMMENT ON COLUMN user_notification_preferences.critical_news_alerts_enabled IS
  'Stores whether portfolio-matched critical news alerts are enabled.';
COMMENT ON COLUMN user_notification_preferences.earnings_report_alerts_enabled IS
  'Stores whether latest earnings-report link alerts are enabled.';
COMMENT ON COLUMN user_notification_preferences.price_move_alerts_enabled IS
  'Stores whether holding price-move threshold alerts are enabled.';
COMMENT ON COLUMN user_notification_preferences.price_move_threshold_percent IS
  'Absolute holding move threshold percentage for price alerts.';
COMMENT ON COLUMN user_notification_preferences.concentration_alerts_enabled IS
  'Stores whether position concentration threshold alerts are enabled.';
COMMENT ON COLUMN user_notification_preferences.concentration_threshold_percent IS
  'Largest-position threshold percentage for concentration alerts.';
