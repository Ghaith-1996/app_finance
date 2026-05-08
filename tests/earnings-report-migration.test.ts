import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("024_ticker_earnings_reports.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "024_ticker_earnings_reports.sql"),
    "utf8",
  );

  it("defines one canonical row per symbol and tracks active/inactive state", () => {
    expect(migration).toMatch(/CREATE TABLE ticker_earnings_reports/i);
    expect(migration).toMatch(/symbol TEXT PRIMARY KEY/i);
    expect(migration).toMatch(/is_active BOOLEAN NOT NULL DEFAULT true/i);
    expect(migration).toMatch(/last_checked_at TIMESTAMPTZ/i);
  });

  it("enables RLS with authenticated reads only", () => {
    expect(migration).toMatch(/ALTER TABLE ticker_earnings_reports ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(/CREATE POLICY "Authenticated users can read ticker_earnings_reports"/i);
    expect(migration).not.toMatch(/CREATE POLICY .*ticker_earnings_reports.*FOR INSERT/i);
    expect(migration).not.toMatch(/CREATE POLICY .*ticker_earnings_reports.*FOR UPDATE/i);
    expect(migration).not.toMatch(/CREATE POLICY .*ticker_earnings_reports.*FOR DELETE/i);
  });

  it("stores the preferred/company/sec URL fields and report metadata", () => {
    expect(migration).toMatch(/preferred_url TEXT/i);
    expect(migration).toMatch(/company_url TEXT/i);
    expect(migration).toMatch(/sec_url TEXT/i);
    expect(migration).toMatch(/url_source TEXT CHECK \(url_source IN \('company', 'sec'\)\)/i);
    expect(migration).toMatch(/report_date DATE/i);
    expect(migration).toMatch(/filing_form TEXT/i);
    expect(migration).toMatch(/title TEXT/i);
    expect(migration).toMatch(/error TEXT/i);
  });
});
