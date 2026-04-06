import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("020_durable_ai_usage_limits.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "020_durable_ai_usage_limits.sql"),
    "utf8",
  );

  it("enables RLS on the durable usage tables", () => {
    expect(migration).toMatch(/ALTER TABLE ai_usage_counters ENABLE ROW LEVEL SECURITY;/);
    expect(migration).toMatch(/ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;/);
  });

  it("does not grant authenticated-user policies on durable usage tables", () => {
    expect(migration).not.toMatch(/CREATE POLICY .*ai_usage_counters/i);
    expect(migration).not.toMatch(/CREATE POLICY .*rate_limit_events/i);
  });

  it("defines atomic SQL functions for quota and rate-limit checks", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION consume_ai_quota/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION consume_rate_limit/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
  });

  it("pins durable RPC functions to the public schema search_path", () => {
    expect(migration).toMatch(/FUNCTION get_ai_quota_status[\s\S]*SET search_path = public/i);
    expect(migration).toMatch(/FUNCTION consume_ai_quota[\s\S]*SET search_path = public/i);
    expect(migration).toMatch(/FUNCTION consume_rate_limit[\s\S]*SET search_path = public/i);
  });
});
