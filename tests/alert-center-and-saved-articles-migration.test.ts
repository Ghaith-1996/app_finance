import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("029_alert_center_and_saved_articles.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "029_alert_center_and_saved_articles.sql"),
    "utf-8",
  );

  it("allows users to mark their own alerts read without broad writes", () => {
    expect(migration).toMatch(/ON notification_alerts FOR UPDATE/i);
    expect(migration).toMatch(/USING \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(/GRANT UPDATE \(read_at\) ON notification_alerts TO authenticated/i);
  });

  it("creates a per-user saved articles table with RLS", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS user_saved_articles/i);
    expect(migration).toMatch(/UNIQUE \(user_id, news_item_id\)/i);
    expect(migration).toMatch(/ALTER TABLE user_saved_articles ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FOR SELECT[\s\S]+USING \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(/FOR INSERT[\s\S]+WITH CHECK \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(/FOR DELETE[\s\S]+USING \(auth\.uid\(\) = user_id\)/i);
  });
});
