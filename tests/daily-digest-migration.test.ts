import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("024_daily_digest_notifications.sql", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "024_daily_digest_notifications.sql"),
    "utf8",
  );

  it("creates the notification preferences and digest audit tables", () => {
    expect(migration).toMatch(/CREATE TABLE user_notification_preferences/i);
    expect(migration).toMatch(/CREATE TABLE notification_digests/i);
    expect(migration).toMatch(/CREATE TABLE notification_deliveries/i);
    expect(migration).toMatch(/status IN \('pending', 'sent', 'skipped', 'failed', 'uncertain'\)/i);
  });

  it("enforces uniqueness for one digest per user per day and one delivery per channel", () => {
    expect(migration).toMatch(/UNIQUE \(user_id, digest_date\)/i);
    expect(migration).toMatch(/UNIQUE \(digest_id, channel\)/i);
  });

  it("enables RLS and keeps delivery audit rows service-role only", () => {
    expect(migration).toMatch(/ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(/ALTER TABLE notification_digests ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(/ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).not.toMatch(/CREATE POLICY .*notification_deliveries/i);
  });

  it("lets users manage their own preferences and read only their own digests", () => {
    expect(migration).toMatch(/CREATE POLICY "Users can manage own notification preferences"/i);
    expect(migration).toMatch(/CREATE POLICY "Users can read own notification digests"/i);
  });
});
