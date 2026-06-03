import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("031_user_investment_thesis_history.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "031_user_investment_thesis_history.sql"),
    "utf-8",
  );

  it("creates an append-only thesis history table with version metadata", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS user_investment_thesis_history/i);
    expect(migration).toMatch(/thesis_id UUID NOT NULL REFERENCES user_investment_theses\(id\)/i);
    expect(migration).toMatch(/change_type TEXT NOT NULL DEFAULT 'updated'/i);
    expect(migration).toMatch(/CHECK \(change_type IN \('created', 'updated', 'deleted'\)\)/i);
    expect(migration).toMatch(/captured_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it("enables RLS and lets users read and insert only their own snapshots", () => {
    expect(migration).toMatch(/ALTER TABLE user_investment_thesis_history ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ON user_investment_thesis_history FOR SELECT/i);
    expect(migration).toMatch(/USING \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(/ON user_investment_thesis_history FOR INSERT/i);
    expect(migration).toMatch(/WITH CHECK \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(/GRANT SELECT, INSERT ON user_investment_thesis_history TO authenticated/i);
  });
});
