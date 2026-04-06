import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("023_analysis_run_heartbeat.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "023_analysis_run_heartbeat.sql"),
    "utf8",
  );

  it("adds updated_at to analysis_runs and installs the heartbeat trigger", () => {
    expect(migration).toMatch(/ALTER TABLE analysis_runs/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/SET updated_at = COALESCE\(completed_at, started_at, created_at, now\(\)\)/i);
    expect(migration).toMatch(/ALTER COLUMN updated_at SET DEFAULT now\(\)/i);
    expect(migration).toMatch(/ALTER COLUMN updated_at SET NOT NULL/i);
    expect(migration).toMatch(/CREATE TRIGGER analysis_runs_updated_at/i);
    expect(migration).toMatch(/EXECUTE FUNCTION set_updated_at\(\)/i);
  });
});
