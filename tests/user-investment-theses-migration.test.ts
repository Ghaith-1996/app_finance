import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("030_user_investment_theses.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "030_user_investment_theses.sql"),
    "utf-8",
  );

  it("creates the thesis tracker table with portfolio and watchlist scopes", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS user_investment_theses/i);
    expect(migration).toMatch(/scope TEXT NOT NULL DEFAULT 'holding'/i);
    expect(migration).toMatch(/CHECK \(scope IN \('holding', 'watchlist'\)\)/i);
    expect(migration).toMatch(/risks TEXT\[\] NOT NULL DEFAULT '\{\}'/i);
    expect(migration).toMatch(/idx_user_investment_theses_portfolio_unique/i);
    expect(migration).toMatch(/idx_user_investment_theses_watchlist_unique/i);
  });

  it("enables RLS and restricts rows to the owning user and portfolio", () => {
    expect(migration).toMatch(/ALTER TABLE user_investment_theses ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ON user_investment_theses FOR SELECT/i);
    expect(migration).toMatch(/auth\.uid\(\) = user_id/i);
    expect(migration).toMatch(/portfolios\.user_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON user_investment_theses TO authenticated/i);
  });
});
