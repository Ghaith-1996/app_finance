import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("021_phase2_security_and_concurrency.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "021_phase2_security_and_concurrency.sql"),
    "utf8",
  );

  it("adds billing event processing-state fields for atomic webhook idempotence", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS processing_state TEXT/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS last_error TEXT/i);
    expect(migration).toMatch(/processing_state IN \('processing', 'processed', 'failed'\)/i);
  });

  it("enforces one subscription row per user", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique/i);
  });

  it("adds degraded analysis status and active-run uniqueness", () => {
    expect(migration).toMatch(/ALTER TYPE analysis_status ADD VALUE IF NOT EXISTS 'degraded'/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_runs_active_portfolio_unique/i);
  });

  it("defines atomic plan-aware quota consumption with locked search_path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION consume_ai_quota_for_user/i);
    expect(migration).toMatch(/SET search_path = public/i);
    expect(migration).toMatch(/denial_code/i);
    expect(migration).toMatch(/plan_upgrade_required/i);
  });
});
