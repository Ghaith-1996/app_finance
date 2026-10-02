import { describe, expect, it } from "vitest";

import { runSmartAlertsCron } from "@/lib/notifications/smart-alerts";

// Audit J4: analysing the same article twice keeps one alert and its read state.

type Row = Record<string, unknown>;

function readColumn(row: Row, column: string): unknown {
  if (column.includes("->>")) {
    const [jsonColumn, key] = column.split("->>");
    const value = row[jsonColumn];
    return value && typeof value === "object" ? (value as Row)[key] : undefined;
  }
  if (column.includes(".")) {
    const [head, tail] = column.split(".");
    const value = row[head];
    return value && typeof value === "object" ? (value as Row)[tail] : undefined;
  }
  return row[column];
}

/** Fake that enforces UNIQUE (user_id, alert_type, dedupe_key) like the real table. */
function makeSupabase(db: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let limit: number | null = null;
    let offset = 0;
    const api = {
      select: () => api,
      or: () => api,
      order: () => api,
      eq: (column: string, value: unknown) => {
        filters.push((row) => readColumn(row, column) === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(readColumn(row, column)));
        return api;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => String(readColumn(row, column) ?? "") >= String(value ?? ""));
        return api;
      },
      limit: (value: number) => {
        limit = value;
        return api;
      },
      range: (from: number, to: number) => {
        offset = from;
        limit = to - from + 1;
        return api;
      },
      maybeSingle: async () => ({ data: (db[table] ?? []).filter((row) => filters.every((f) => f(row)))[0] ?? null, error: null }),
      upsert: async (rows: Row | Row[], options?: { ignoreDuplicates?: boolean }) => {
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const clash = (db[table] ?? []).find(
            (existing) =>
              existing.user_id === row.user_id &&
              existing.alert_type === row.alert_type &&
              existing.dedupe_key === row.dedupe_key,
          );
          if (clash && options?.ignoreDuplicates) continue;
          db[table] = [...(db[table] ?? []), { ...row, read_at: null }];
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: { data: Row[]; error: null }) => void) => {
        let rows = (db[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (limit != null) rows = rows.slice(offset, offset + limit);
        resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return { db, from: (table: string) => builder(table) };
}

const article = {
  id: "news-1",
  headline: "Regulators review platform rules",
  source: "MarketWire",
  published_at: "2026-05-31T13:30:00.000Z",
  category: "regulation",
};

function feedRow(id: string, runId: string): Row {
  return {
    id,
    analysis_run_id: runId,
    portfolio_id: "portfolio-1",
    relevance_score: 92,
    why_it_matters: "Regulatory pressure could affect margins.",
    ai_summary: "Policy pressure is rising.",
    holdings: ["AAPL"],
    news_items: article,
  };
}

function baseDb(): Record<string, Row[]> {
  return {
    user_notification_preferences: [
      {
        user_id: "user-1",
        critical_news_alerts_enabled: true,
        earnings_report_alerts_enabled: false,
        price_move_alerts_enabled: false,
        price_move_threshold_percent: 5,
        concentration_alerts_enabled: false,
        concentration_threshold_percent: 35,
      },
    ],
    portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Core" }],
    holdings: [],
    analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: "2026-05-31T13:00:00.000Z" }],
    feed_items: [feedRow("feed-1", "run-1")],
    ticker_earnings_reports: [],
    notification_alerts: [],
  };
}

const now = new Date("2026-05-31T14:00:00.000Z");

describe("critical news alert identity (J4)", () => {
  it("reanalysis of the same article keeps one alert and its read state", async () => {
    const supabase = makeSupabase(baseDb());

    await runSmartAlertsCron({ supabase: supabase as never, now });
    expect(supabase.db.notification_alerts).toHaveLength(1);
    expect(supabase.db.notification_alerts[0].dedupe_key).toBe("portfolio-1:news:news-1");
    supabase.db.notification_alerts[0].read_at = "2026-05-31T14:05:00.000Z";

    // A new analysis run writes a new feed row (new UUID) for the same article.
    supabase.db.analysis_runs = [{ id: "run-2", portfolio_id: "portfolio-1", status: "complete", completed_at: "2026-05-31T14:15:00.000Z" }];
    supabase.db.feed_items = [feedRow("feed-2", "run-2")];

    await runSmartAlertsCron({ supabase: supabase as never, now: new Date("2026-05-31T14:20:00.000Z") });

    expect(supabase.db.notification_alerts).toHaveLength(1);
    expect(supabase.db.notification_alerts[0].read_at).toBe("2026-05-31T14:05:00.000Z");
  });

  it("does not duplicate an article already alerted under the legacy feed-row key", async () => {
    const db = baseDb();
    db.notification_alerts = [
      {
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        alert_type: "critical_news",
        dedupe_key: "portfolio-1:feed-0",
        payload: { newsItemId: "news-1" },
        read_at: null,
      },
    ];
    const supabase = makeSupabase(db);

    await runSmartAlertsCron({ supabase: supabase as never, now });

    expect(supabase.db.notification_alerts).toHaveLength(1);
  });

  it("still alerts a different article", async () => {
    const supabase = makeSupabase(baseDb());
    await runSmartAlertsCron({ supabase: supabase as never, now });

    supabase.db.feed_items = [
      { ...feedRow("feed-3", "run-1"), news_items: { ...article, id: "news-2", headline: "Lawsuit risk grows" } },
    ];
    await runSmartAlertsCron({ supabase: supabase as never, now });

    expect(supabase.db.notification_alerts.map((row) => row.dedupe_key)).toEqual([
      "portfolio-1:news:news-1",
      "portfolio-1:news:news-2",
    ]);
  });
});
