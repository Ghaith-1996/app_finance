import { describe, expect, it } from "vitest";

import { runSmartAlertsCron } from "@/lib/notifications/smart-alerts";

type Row = Record<string, unknown>;

function makeSupabase(seed: Record<string, Row[]>) {
  const db = structuredClone(seed) as Record<string, Row[]>;
  const upserts: Row[] = [];

  function builder(table: string) {
    const state = {
      eq: [] as Array<[string, unknown]>,
      in: [] as Array<[string, unknown[]]>,
      gte: [] as Array<[string, unknown]>,
      limit: null as number | null,
    };

    const api = {
      select: () => api,
      or: () => api,
      eq: (column: string, value: unknown) => {
        state.eq.push([column, value]);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        state.in.push([column, values]);
        return api;
      },
      gte: (column: string, value: unknown) => {
        state.gte.push([column, value]);
        return api;
      },
      order: () => api,
      limit: (value: number) => {
        state.limit = value;
        return api;
      },
      maybeSingle: async () => {
        const rows = applyFilters(db[table] ?? [], state);
        return { data: rows[0] ?? null, error: null };
      },
      upsert: async (rows: Row | Row[]) => {
        const items = Array.isArray(rows) ? rows : [rows];
        upserts.push(...items);
        db[table] = [...(db[table] ?? []), ...items];
        return { data: null, error: null };
      },
      then: (
        resolve: (value: { data: Row[]; error: null }) => void,
      ) => {
        let rows = applyFilters(db[table] ?? [], state);
        if (state.limit != null) rows = rows.slice(0, state.limit);
        resolve({ data: rows, error: null });
      },
    };

    return api;
  }

  return {
    db,
    upserts,
    from: (table: string) => builder(table),
  };
}

function applyFilters(rows: Row[], state: {
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  gte: Array<[string, unknown]>;
}) {
  return rows.filter((row) => {
    for (const [column, value] of state.eq) {
      if (row[column] !== value) return false;
    }
    for (const [column, values] of state.in) {
      if (!values.includes(row[column])) return false;
    }
    for (const [column, value] of state.gte) {
      const rowValue = column.includes(".")
        ? getNested(row, column)
        : row[column];
      if (String(rowValue ?? "") < String(value ?? "")) return false;
    }
    return true;
  });
}

function getNested(row: Row, column: string) {
  const [head, tail] = column.split(".");
  const value = row[head];
  if (!tail || !value || typeof value !== "object") return value;
  return (value as Row)[tail];
}

describe("smart alerts cron service", () => {
  it("generates deduplicated alert rows from enabled rules", async () => {
    const supabase = makeSupabase({
      user_notification_preferences: [
        {
          user_id: "user-1",
          critical_news_alerts_enabled: true,
          earnings_report_alerts_enabled: true,
          price_move_alerts_enabled: true,
          price_move_threshold_percent: 5,
          concentration_alerts_enabled: true,
          concentration_threshold_percent: 35,
        },
      ],
      portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Core" }],
      holdings: [
        {
          id: "holding-1",
          portfolio_id: "portfolio-1",
          symbol: "AAPL",
          company: "Apple",
          quantity: 10,
          current_price: 100,
          current_value: 1000,
          daily_change: 6.2,
        },
        {
          id: "holding-2",
          portfolio_id: "portfolio-1",
          symbol: "MSFT",
          company: "Microsoft",
          quantity: 1,
          current_price: 100,
          current_value: 100,
          daily_change: 1,
        },
      ],
      analysis_runs: [
        {
          id: "run-1",
          portfolio_id: "portfolio-1",
          status: "complete",
          completed_at: "2026-05-31T13:00:00.000Z",
        },
      ],
      feed_items: [
        {
          id: "feed-1",
          analysis_run_id: "run-1",
          portfolio_id: "portfolio-1",
          relevance_score: 92,
          why_it_matters: "Regulatory pressure could affect margins.",
          ai_summary: "Policy pressure is rising.",
          holdings: ["AAPL"],
          news_items: {
            id: "news-1",
            headline: "Regulators review platform rules",
            source: "MarketWire",
            published_at: "2026-05-31T13:30:00.000Z",
            category: "regulation",
          },
        },
      ],
      ticker_earnings_reports: [
        {
          symbol: "AAPL",
          preferred_url: "https://investor.example.com/aapl",
          url_source: "company",
          report_date: "2026-05-01",
          title: "Apple Q2 results",
          is_active: true,
        },
      ],
      notification_alerts: [],
    });

    const result = await runSmartAlertsCron({
      supabase: supabase as never,
      now: new Date("2026-05-31T14:00:00.000Z"),
    });

    expect(result).toMatchObject({
      usersScanned: 1,
      portfoliosScanned: 1,
      alertsGenerated: 4,
      errors: [],
    });
    expect(supabase.upserts.map((row) => row.alert_type)).toEqual([
      "critical_news",
      "earnings_report",
      "price_move",
      "concentration",
    ]);
    expect(supabase.upserts[0]).toMatchObject({
      user_id: "user-1",
      portfolio_id: "portfolio-1",
      action_href: "/feed?story=news-1",
    });
  });
});
