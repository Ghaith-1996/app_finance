import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingHoldingRow, PricingQuote } from "@/lib/services/holding-pricing";

const dependencies = vi.hoisted(() => ({
  supabase: null as SupabaseClient | null,
  getQuotes: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => dependencies.supabase }));
vi.mock("@/lib/services/yahoo-finance", () => ({
  getQuotes: dependencies.getQuotes,
  getQuote: vi.fn(() => { throw new Error("Unexpected external FX quote"); }),
}));

import { recordPortfolioValueSnapshots } from "@/lib/services/portfolio-value-snapshots";

const now = new Date("2026-10-07T12:05:00Z");
type Holding = PricingHoldingRow & { portfolio_id: string };
type Snapshot = { portfolio_id: string; bucket_start: string; total_value: number; positions_count: number };
let fixtureId = 0;

function fixture(count: number, serverCap = 17) {
  const portfolios = Array.from({ length: count }, (_, index) => ({
    id: `p${String(index).padStart(4, "0")}`, user_id: "fixture-user",
  }));
  const holdings: Holding[] = portfolios.flatMap(({ id }, index) =>
    Array.from({ length: 3 }, (_, position) => ({
      id: `${id}-h${position}`, portfolio_id: id, symbol: `S${index}`, quantity: 2,
      current_price: 10, price: 10, previous_close: 10, daily_change: 0, average_cost: 5,
      quote_currency: "USD", fx_rate_to_usd: 1, fx_as_of: now.toISOString(), quote_as_of: now.toISOString(),
    })),
  );
  const snapshots = new Map<string, Snapshot>();
  const updates: { p_portfolio_id: string; p_updates: { id: string; allocation: number }[] }[] = [];
  const events: string[] = [];
  const scopes: (string[] | null)[] = [];
  const quoteBatches: string[][] = [];
  const failures = { holdingsFor: "", holdingsOffset: 0, upsertFor: "", quotesFor: "", rpcFor: "" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
  // The real supabase-js builder emits requests into this deterministic Data API transport.
  // This deliberately does not claim to exercise Postgres transactions or RLS.
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.split("/").at(-1);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), serverCap);
    if (table === "portfolios") {
      events.push("portfolios");
      const after = url.searchParams.get("id")?.replace(/^gt\./, "");
      const rows = after ? portfolios.filter((row) => row.id > after) : portfolios;
      return reply(rows.slice(offset, offset + limit));
    }
    if (table === "holdings") {
      const filter = url.searchParams.get("portfolio_id");
      const ids = filter?.startsWith("in.(") ? filter.slice(4, -1).split(",") : null;
      scopes.push(ids);
      events.push("holdings");
      if (ids?.includes(failures.holdingsFor) && offset >= failures.holdingsOffset) {
        return reply({ message: "holdings unavailable" }, 500);
      }
      const rows = ids ? holdings.filter((row) => ids.includes(row.portfolio_id)) : holdings;
      return reply(rows.slice(offset, offset + limit));
    }
    if (table === "apply_holding_price_updates") {
      const body = await request.json();
      if (body.p_portfolio_id === failures.rpcFor) return reply({ message: "price write unavailable" }, 500);
      updates.push(body);
      return reply(null);
    }
    if (table === "portfolio_value_snapshots") {
      const rows = await request.json() as Snapshot[];
      events.push("snapshots");
      expect(url.searchParams.get("on_conflict")).toBe("portfolio_id,bucket_start");
      if (rows.some((row) => row.portfolio_id === failures.upsertFor)) return reply({ message: "snapshot write unavailable" }, 500);
      for (const row of rows) snapshots.set(`${row.portfolio_id}:${row.bucket_start}`, row);
      return reply(null);
    }
    throw new Error(`Unexpected Data API request: ${request.method} ${url.pathname}`);
  };
  dependencies.supabase = createClient("https://snapshot-fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `snapshot-fixture-${fixtureId++}` }, global: { fetch: transport },
  });
  dependencies.getQuotes.mockImplementation(async (symbols: string[]) => {
    events.push("quotes");
    quoteBatches.push(symbols);
    if (symbols.includes(failures.quotesFor)) throw new Error("quotes unavailable");
    return new Map<string, PricingQuote>(symbols.map((symbol) => [symbol, {
      price: 20, previousClose: 10, dailyChange: 100, currency: "USD",
    }]));
  });
  return { portfolios, holdings, snapshots, updates, events, scopes, quoteBatches, failures };
}

describe("portfolio snapshot batches", () => {
  beforeEach(() => { dependencies.getQuotes.mockReset(); });

  it("persists each bounded group before reading later portfolios, without truncating holdings", async () => {
    const state = fixture(121);
    const result = await recordPortfolioValueSnapshots({ now });
    expect(result).toMatchObject({ portfoliosScanned: 121, portfoliosSnapshotted: 121, portfoliosSkipped: 0, holdingsUpdated: 363, errors: [] });
    expect(state.scopes.every((ids) => ids !== null && ids.length <= 50)).toBe(true);
    expect(state.quoteBatches.length).toBeGreaterThan(1);
    expect(Math.max(...state.quoteBatches.map((batch) => batch.length))).toBeLessThanOrEqual(50);
    expect(state.events.indexOf("snapshots")).toBeLessThan(state.events.indexOf("portfolios", 1));
    expect([...state.snapshots.values()].every((row) => row.total_value === 120 && row.positions_count === 3)).toBe(true);
    expect(state.updates).toHaveLength(121);
    expect(state.updates.every((write) => write.p_updates.length === 3 && write.p_updates.every((row) => row.id.startsWith(write.p_portfolio_id)))).toBe(true);
  });

  it("maxPortfolios bounds reads and quotes as well as writes, and retries upsert the same hour", async () => {
    const state = fixture(121);
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await recordPortfolioValueSnapshots({ now, maxPortfolios: 20 });
      expect(result).toMatchObject({ portfoliosScanned: 20, portfoliosSnapshotted: 20, errors: [] });
    }
    expect(state.snapshots.size).toBe(20);
    expect(state.scopes.every((ids) => ids?.every((id) => id <= "p0019"))).toBe(true);
    expect(state.quoteBatches.flat().every((symbol) => Number(symbol.slice(1)) < 20)).toBe(true);
  });

  it("skips an incomplete holding read and continues with later portfolios", async () => {
    const state = fixture(4, 2);
    state.failures.holdingsFor = "p0000";
    state.failures.holdingsOffset = 2;
    const result = await recordPortfolioValueSnapshots({ now });
    expect(result).toMatchObject({ portfoliosScanned: 4, portfoliosSnapshotted: 2, portfoliosSkipped: 2, holdingsUpdated: 6 });
    expect(result.errors).toContain("holdings unavailable");
    expect([...state.snapshots.values()].map((row) => row.portfolio_id)).toEqual(["p0002", "p0003"]);
  });

  it("keeps earlier writes and continues after a snapshot batch write fails", async () => {
    const state = fixture(6, 2);
    state.failures.upsertFor = "p0002";
    const result = await recordPortfolioValueSnapshots({ now });
    expect(result).toMatchObject({ portfoliosScanned: 6, portfoliosSnapshotted: 4, holdingsUpdated: 18 });
    expect(result.errors).toContain("snapshot upsert: snapshot write unavailable");
    expect([...state.snapshots.values()].map((row) => row.portfolio_id)).toEqual(["p0000", "p0001", "p0004", "p0005"]);
  });

  it("preserves stored valuation on a quote failure and reports price RPC errors", async () => {
    const state = fixture(4, 2);
    state.failures.quotesFor = "S0";
    state.failures.rpcFor = "p0002";
    const result = await recordPortfolioValueSnapshots({ now });
    expect(result).toMatchObject({ portfoliosScanned: 4, portfoliosSnapshotted: 4, holdingsUpdated: 3, quoteFetchError: "quotes unavailable" });
    expect(result.errors).toContain("portfolio p0002 price update: price write unavailable");
    expect([...state.snapshots.values()].map((row) => row.total_value)).toEqual([60, 60, 120, 120]);
  });
});
