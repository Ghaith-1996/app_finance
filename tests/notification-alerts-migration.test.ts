import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("028_notification_alerts.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "028_notification_alerts.sql"),
    "utf8",
  );

  it("creates a deduplicated smart alert table", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS notification_alerts/i);
    expect(migration).toMatch(/alert_type IN/i);
    expect(migration).toMatch(/UNIQUE \(user_id, alert_type, dedupe_key\)/i);
    expect(migration).toMatch(/payload JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
  });

  it("enables RLS and grants authenticated read access", () => {
    expect(migration).toMatch(/ALTER TABLE notification_alerts ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE POLICY "Users can read own notification alerts"/i);
    expect(migration).toMatch(/GRANT SELECT ON notification_alerts TO authenticated/i);
    expect(migration).toMatch(/GRANT ALL ON notification_alerts TO service_role/i);
  });
});
