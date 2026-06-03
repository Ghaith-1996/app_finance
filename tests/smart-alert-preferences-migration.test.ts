import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("027_smart_alert_preferences.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "027_smart_alert_preferences.sql"),
    "utf8",
  );

  it("adds personalized alert rule columns to notification preferences", () => {
    expect(migration).toMatch(/critical_news_alerts_enabled BOOLEAN NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/earnings_report_alerts_enabled BOOLEAN NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/price_move_alerts_enabled BOOLEAN NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/price_move_threshold_percent DECIMAL\(5, 2\) NOT NULL DEFAULT 5\.00/i);
    expect(migration).toMatch(/concentration_alerts_enabled BOOLEAN NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/concentration_threshold_percent DECIMAL\(5, 2\) NOT NULL DEFAULT 35\.00/i);
  });

  it("bounds user-editable thresholds", () => {
    expect(migration).toMatch(/price_move_threshold_percent >= 1/i);
    expect(migration).toMatch(/price_move_threshold_percent <= 50/i);
    expect(migration).toMatch(/concentration_threshold_percent >= 10/i);
    expect(migration).toMatch(/concentration_threshold_percent <= 90/i);
  });
});
