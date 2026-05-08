CREATE TABLE ticker_earnings_reports (
  symbol TEXT PRIMARY KEY,
  preferred_url TEXT,
  url_source TEXT CHECK (url_source IN ('company', 'sec')),
  company_url TEXT,
  sec_url TEXT,
  report_date DATE,
  filing_form TEXT,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticker_earnings_reports_active
  ON ticker_earnings_reports(is_active, symbol);

CREATE INDEX idx_ticker_earnings_reports_report_date
  ON ticker_earnings_reports(report_date DESC NULLS LAST);

CREATE TRIGGER ticker_earnings_reports_updated_at
  BEFORE UPDATE ON ticker_earnings_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ticker_earnings_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ticker_earnings_reports"
  ON ticker_earnings_reports FOR SELECT
  TO authenticated
  USING (true);
