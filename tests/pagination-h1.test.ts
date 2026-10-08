import { describe, expect, it } from "vitest";

import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { fetchAllRows } from "@/lib/supabase/paginate";

// Audit H1: global scans read every row even when the server caps each response.

/** A PostgREST-like table that never returns more than `cap` rows per request. */
function cappedTable<T>(rows: T[], cap: number) {
  return (from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
}

describe("fetchAllRows", () => {
  it("reads all rows when the server cap is smaller than the requested page", async () => {
    const rows = Array.from({ length: 2_345 }, (_, index) => ({ id: index }));
    const result = await fetchAllRows(cappedTable(rows, 300), 1_000);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2_345);
    expect(new Set(result.data.map((row) => row.id)).size).toBe(2_345);
  });

  it("returns the rows read so far plus the error when a page fails", async () => {
    let calls = 0;
    const result = await fetchAllRows<{ id: number }>(() => {
      calls += 1;
      return Promise.resolve(
        calls === 1 ? { data: [{ id: 1 }], error: null } : { data: null, error: { message: "timeout" } },
      );
    });
    expect(result).toEqual({ data: [{ id: 1 }], error: { message: "timeout" } });
  });
});

describe("resolveGlobalTickers", () => {
  it("includes symbols held beyond the first 1,000 rows", async () => {
    const holdings = Array.from({ length: 2_500 }, (_, index) => ({ symbol: `S${index}` }));
    const watchlist = [{ symbol: "WATCH" }];
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          order: () => ({
            range: cappedTable(table === "holdings" ? holdings : watchlist, 1_000),
          }),
        }),
      }),
    };

    const result = await resolveGlobalTickers(supabase as never);

    expect(result.error).toBeUndefined();
    expect(result.tickers).toHaveLength(2_501);
    expect(result.tickers).toContain("S2499");
    expect(result.tickers).toContain("WATCH");
  });
});
