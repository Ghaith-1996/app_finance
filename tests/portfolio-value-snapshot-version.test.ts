import { describe, expect, it, vi } from "vitest";

// Review R3: pre-USD snapshots (100 CAD) must never be charted next to USD ones (73 USD).

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { loadPortfolioValueSnapshots, SNAPSHOT_VALUATION_VERSION } from "@/lib/services/portfolio-value-snapshots";

type Row = Record<string, unknown>;

/** Minimal PostgREST-like builder that really applies eq/order/limit to in-memory rows. */
function fakeSupabase(rows: Row[]) {
  return {
    from: () => {
      let result = [...rows];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          result = result.filter((row) => row[column] === value);
          return builder;
        },
        order: (column: string, { ascending }: { ascending: boolean }) => {
          result.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
          return builder;
        },
        limit: (count: number) => Promise.resolve({ data: result.slice(0, count), error: null }),
      };
      return builder;
    },
  };
}

function row(bucket: string, totalValue: number, version: number | null, currency = "USD"): Row {
  return {
    id: bucket,
    portfolio_id: "p1",
    captured_at: bucket,
    bucket_start: bucket,
    total_value: totalValue,
    cost_basis: totalValue,
    day_change_percent: 0,
    quote_currency: currency,
    positions_count: 1,
    valuation_version: version,
  };
}

describe("portfolio value snapshot history boundary (R3)", () => {
  it("returns only rows in the current valuation unit, oldest first", async () => {
    const supabase = fakeSupabase([
      // Legacy: a 100 CAD position summed as 100 (even labelled USD).
      row("2026-10-01T10:00:00Z", 100, null, "USD"),
      row("2026-10-01T11:00:00Z", 100, null, "CAD"),
      row("2026-10-02T10:00:00Z", 73, SNAPSHOT_VALUATION_VERSION),
      row("2026-10-02T11:00:00Z", 73, SNAPSHOT_VALUATION_VERSION),
    ]);

    const snapshots = await loadPortfolioValueSnapshots(supabase as never, "p1");

    expect(snapshots.map((snapshot) => snapshot.totalValue)).toEqual([73, 73]);
    expect(snapshots[0].bucketStart).toBe("2026-10-02T10:00:00Z");
  });

  it("a portfolio with only legacy rows has no stored history (chart falls back to live quotes)", async () => {
    const supabase = fakeSupabase([row("2026-10-01T10:00:00Z", 100, null), row("2026-10-01T11:00:00Z", 100, null)]);

    expect(await loadPortfolioValueSnapshots(supabase as never, "p1")).toEqual([]);
  });
});
