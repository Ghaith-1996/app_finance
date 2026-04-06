import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("022_stale_recovery_backfill.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "022_stale_recovery_backfill.sql"),
    "utf8",
  );

  it("backfills processing timestamps for legacy billing events", () => {
    expect(migration).toMatch(/UPDATE billing_events/i);
    expect(migration).toMatch(/SET processed_at = now\(\)/i);
    expect(migration).toMatch(/processing_state IN \('processing', 'failed'\)/i);
    expect(migration).toMatch(/processed_at IS NULL/i);
  });
});
