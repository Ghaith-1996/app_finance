import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  discoverCompanyEarningsLink,
  resolveLatestSecEarningsReport,
  resolveTrackedSymbolUniverse,
  syncTrackedEarningsReports,
} from "@/lib/services/earnings-reports";

type TableName = "holdings" | "watchlist_items" | "ticker_earnings_reports";

type MockTables = Record<TableName, Array<Record<string, unknown>>>;

type FailureValue = string | null | undefined;

/** PostgREST-style response cap: a single read never returns more than this many rows. */
const mockLimits = { maxRows: Number.POSITIVE_INFINITY };

type MockFailures = {
  select?: Partial<Record<TableName, FailureValue | FailureValue[]>>;
  upsert?: Partial<Record<TableName, FailureValue | FailureValue[]>>;
  update?: Partial<Record<TableName, FailureValue | FailureValue[]>>;
};

function pickColumns(row: Record<string, unknown>, columns: string) {
  if (columns.trim() === "*") {
    return { ...row };
  }

  const keys = columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  return keys.reduce<Record<string, unknown>>((accumulator, key) => {
    accumulator[key] = row[key];
    return accumulator;
  }, {});
}

type MockQueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

function createQueryBuilder(
  rows: Array<Record<string, unknown>>,
  selection: string | Record<string, unknown>,
  errorMessage?: string,
) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let window: [number, number] | null = null;

  const builder = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      filters.push((row) => allowed.has(row[column]));
      return builder;
    },
    order: () => builder,
    range(from: number, to: number) {
      window = [from, to];
      return builder;
    },
    then<TResult1 = MockQueryResult, TResult2 = never>(
      onfulfilled?: ((value: MockQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      if (errorMessage) {
        return Promise.resolve({ data: null, error: { message: errorMessage } })
          .then(onfulfilled, onrejected);
      }

      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      let data: MockQueryResult["data"] = null;
      if (typeof selection === "string") {
        data = (window ? matched.slice(window[0], window[1] + 1) : matched)
          .slice(0, mockLimits.maxRows)
          .map((row) => pickColumns(row, selection));
      } else {
        for (const row of matched) Object.assign(row, selection);
      }
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

function createMockSupabase(seed?: Partial<MockTables>, failures?: MockFailures) {
  const tables: MockTables = {
    holdings: [...(seed?.holdings ?? [])],
    watchlist_items: [...(seed?.watchlist_items ?? [])],
    ticker_earnings_reports: [...(seed?.ticker_earnings_reports ?? [])],
  };
  const callCounts = {
    select: { holdings: 0, watchlist_items: 0, ticker_earnings_reports: 0 },
    upsert: { holdings: 0, watchlist_items: 0, ticker_earnings_reports: 0 },
    update: { holdings: 0, watchlist_items: 0, ticker_earnings_reports: 0 },
  };

  function getFailureMessage(
    value: FailureValue | FailureValue[] | undefined,
    index: number,
  ) {
    if (Array.isArray(value)) {
      return value[index] ?? undefined;
    }

    return value ?? undefined;
  }

  return {
    tables,
    from(tableName: TableName) {
      return {
        select(columns: string) {
          const failureMessage = getFailureMessage(
            failures?.select?.[tableName],
            callCounts.select[tableName]++,
          );
          return createQueryBuilder(
            tables[tableName],
            columns,
            failureMessage ?? undefined,
          );
        },
        update(patch: Record<string, unknown>) {
          const failureMessage = getFailureMessage(
            failures?.update?.[tableName],
            callCounts.update[tableName]++,
          );
          return createQueryBuilder(
            tables[tableName],
            patch,
            failureMessage ?? undefined,
          );
        },
        async upsert(
          values: Record<string, unknown> | Array<Record<string, unknown>>,
          options?: { onConflict?: string },
        ) {
          const upsertError = getFailureMessage(
            failures?.upsert?.[tableName],
            callCounts.upsert[tableName]++,
          );
          if (upsertError) {
            return { data: null, error: { message: upsertError } };
          }

          const rows = Array.isArray(values) ? values : [values];
          const conflictColumn = options?.onConflict ?? "symbol";

          for (const row of rows) {
            const conflictValue = row[conflictColumn];
            const existing = tables[tableName].find(
              (candidate) => candidate[conflictColumn] === conflictValue,
            );

            if (existing) {
              Object.assign(existing, row);
            } else {
              tables[tableName].push({ ...row });
            }
          }

          return { data: null, error: null };
        },
      };
    },
  };
}

function htmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

type SecReport = NonNullable<Awaited<ReturnType<typeof resolveLatestSecEarningsReport>>>;
type SyncDeps = NonNullable<Parameters<typeof syncTrackedEarningsReports>[1]>;

function secReport(overrides: Partial<SecReport> = {}): SecReport {
  return {
    url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
    reportDate: "2026-04-30",
    filingDate: "2026-05-01",
    filingForm: "8-K",
    title: "Current report",
    sortDate: "2026-04-30",
    score: 100,
    acceptedAt: "20260501160000",
    ...overrides,
  };
}

function syncDeps(overrides: SyncDeps = {}): SyncDeps {
  return {
    getCompanyWebsiteSeed: async () => null,
    discoverCompanyEarningsLink: async () => null,
    resolveLatestSecEarningsReport: async () => null,
    ...overrides,
  };
}

function oldReport(symbol: string) {
  const url = "https://old.example.com/" + symbol.toLowerCase();
  return {
    symbol,
    preferred_url: url,
    url_source: "company",
    company_url: url,
    sec_url: null,
    report_date: "2025-01-01",
    filing_form: null,
    title: "Old link",
    is_active: true,
    last_checked_at: "2025-01-01T00:00:00.000Z",
    error: null,
  };
}

function mockFetch(routes: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return routes[url]?.() ?? new Response("not found", { status: 404 });
  });
}

describe("earnings report service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the tracked ticker universe from holdings plus watchlist", async () => {
    const supabase = createMockSupabase({
      holdings: [{ symbol: " msft " }, { symbol: "AAPL" }],
      watchlist_items: [{ symbol: "aapl" }, { symbol: "nvda" }, { symbol: null }],
    });

    const symbols = await resolveTrackedSymbolUniverse(supabase as never);
    expect(symbols).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("discovers a company-hosted earnings link from the site seed and landing pages", async () => {
    const fetchImpl = mockFetch({
      "https://investor.example.com/": () => htmlResponse(
        '<html><body><a href="/investor-relations">Investor Relations</a></body></html>',
      ),
      "https://investor.example.com/investor-relations": () => htmlResponse(
        '<html><body><a href="/press/q1-2026-results.html">Q1 2026 Results</a></body></html>',
      ),
    });

    const result = await discoverCompanyEarningsLink("https://investor.example.com/", {
      fetchImpl,
      reportDateHint: "2026-04-30",
      lookupImpl: async () => [{ address: "93.184.216.34" }],
    });

    expect(result).toEqual({
      url: "https://investor.example.com/press/q1-2026-results.html",
      title: "Q1 2026 Results",
    });
  });

  it("rejects invalid or private company website URLs before fetching", async () => {
    const fetchImpl = mockFetch({});

    const result = await discoverCompanyEarningsLink("http://127.0.0.1/internal", {
      fetchImpl,
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks redirect targets that resolve to private or metadata URLs", async () => {
    const fetchImpl = mockFetch({
      "https://investor.example.com/": () => new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    });

    const result = await discoverCompanyEarningsLink("https://investor.example.com/", {
      fetchImpl,
      lookupImpl: async () => [{ address: "93.184.216.34" }],
    });

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("allows redirect chains when every hop stays on a validated public target", async () => {
    const fetchImpl = mockFetch({
      "https://investor.example.com/": () => new Response(null, {
        status: 302,
        headers: { location: "/investor-relations" },
      }),
      "https://investor.example.com/investor-relations": () => htmlResponse(
        '<html><body><a href="/press/q2-2026-results.html">Q2 2026 Results</a></body></html>',
      ),
    });

    const result = await discoverCompanyEarningsLink("https://investor.example.com/", {
      fetchImpl,
      lookupImpl: async () => [{ address: "93.184.216.34" }],
    });

    expect(result).toEqual({
      url: "https://investor.example.com/press/q2-2026-results.html",
      title: "Q2 2026 Results",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated 8-K and 6-K filings when they lack earnings markers", async () => {
    const fetchImpl = mockFetch({
      "https://www.sec.gov/files/company_tickers.json": () => jsonResponse({
        "0": { ticker: "MSFT", cik_str: 789019 },
      }),
      "https://data.sec.gov/submissions/CIK0000789019.json": () => jsonResponse({
        filings: {
          recent: {
            form: ["8-K", "6-K"],
            filingDate: ["2026-05-10", "2026-05-03"],
            reportDate: ["2026-05-10", "2026-05-03"],
            accessionNumber: [
              "0000789019-26-000010",
              "0000789019-26-000003",
            ],
            primaryDocument: ["current-report.htm", "foreign-report.htm"],
            primaryDocDescription: [
              "Entry into a Material Definitive Agreement",
              "Director change notice",
            ],
            items: ["1.01", "5.02"],
            acceptanceDateTime: ["20260510120000", "20260503120000"],
          },
        },
      }),
    });

    const result = await resolveLatestSecEarningsReport("MSFT", { fetchImpl });
    expect(result).toBeNull();
  });

  it("does not let a newer unrelated 8-K beat an older real earnings filing", async () => {
    const fetchImpl = mockFetch({
      "https://www.sec.gov/files/company_tickers.json": () => jsonResponse({
        "0": { ticker: "NVDA", cik_str: 1045810 },
      }),
      "https://data.sec.gov/submissions/CIK0001045810.json": () => jsonResponse({
        filings: {
          recent: {
            form: ["8-K", "8-K", "10-Q"],
            filingDate: ["2026-05-10", "2026-05-01", "2026-04-29"],
            reportDate: ["2026-05-10", "2026-05-01", "2026-04-29"],
            accessionNumber: [
              "0001045810-26-000010",
              "0001045810-26-000007",
              "0001045810-26-000005",
            ],
            primaryDocument: ["other-current-report.htm", "earnings-release.htm", "quarterly-report.htm"],
            primaryDocDescription: [
              "Entry into a Material Definitive Agreement",
              "First Quarter Earnings Results",
              "Quarterly report",
            ],
            items: ["1.01", "2.02", null],
            acceptanceDateTime: ["20260510130000", "20260501120000", "20260429120000"],
          },
        },
      }),
    });

    const result = await resolveLatestSecEarningsReport("NVDA", { fetchImpl });

    expect(result).toEqual(
      expect.objectContaining({
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000007/earnings-release.htm",
        filingForm: "8-K",
        reportDate: "2026-05-01",
      }),
    );
  });

  it("falls back to the SEC filing when no company-hosted link is found", async () => {
    const supabase = createMockSupabase({
      holdings: [{ symbol: "AAPL" }],
    });

    const result = await syncTrackedEarningsReports(supabase as never, syncDeps({
      getCompanyWebsiteSeed: async () => "https://apple.example.com",
      resolveLatestSecEarningsReport: async () => secReport(),
    }));

    expect(result).toEqual({
      processed: 1,
      resolved: 1,
      companyLinks: 0,
      secFallbacks: 1,
      missing: 0,
      inactivated: 0,
      failed: 0,
      stale: 0,
    });
    expect(supabase.tables.ticker_earnings_reports).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        preferred_url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
        url_source: "sec",
        company_url: null,
        sec_url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
        report_date: "2026-04-30",
      }),
    ]);
  });

  it("records a missing result when neither SEC nor company data resolves", async () => {
    const supabase = createMockSupabase({
      holdings: [{ symbol: "SHOP" }],
    });

    const result = await syncTrackedEarningsReports(supabase as never, syncDeps());

    expect(result.missing).toBe(1);
    expect(supabase.tables.ticker_earnings_reports[0]).toEqual(
      expect.objectContaining({
        symbol: "SHOP",
        preferred_url: null,
        url_source: null,
        error: "No earnings report link found.",
      }),
    );
  });

  it("aborts the sync when holdings cannot be read and leaves active rows untouched", async () => {
    const supabase = createMockSupabase(
      {
        ticker_earnings_reports: [
          {
            symbol: "AAPL",
            is_active: true,
            preferred_url: "https://old.example.com/aapl",
            error: null,
          },
        ],
      },
      {
        select: {
          holdings: "db unavailable",
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, syncDeps()),
    ).rejects.toThrow("Failed to load holdings symbols: db unavailable");

    expect(supabase.tables.ticker_earnings_reports[0]).toEqual(
      expect.objectContaining({ symbol: "AAPL", is_active: true }),
    );
  });

  it("surfaces upsert failures instead of reporting a false success", async () => {
    const supabase = createMockSupabase(
      {
        holdings: [{ symbol: "AAPL" }],
      },
      {
        upsert: {
          ticker_earnings_reports: ["write failed", null],
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, syncDeps({
        resolveLatestSecEarningsReport: async () => secReport({
          filingForm: "10-Q",
          title: "Quarterly report",
        }),
      })),
    ).rejects.toThrow("Failed to upsert earnings report row for AAPL: write failed");

    // Audit J6: a failed write is surfaced without a second write that nulls report data.
    expect(supabase.tables.ticker_earnings_reports).toEqual([]);
  });

  it("surfaces the write failure when recording a failed lookup cannot be persisted", async () => {
    const supabase = createMockSupabase(
      {
        holdings: [{ symbol: "AAPL" }],
      },
      {
        upsert: {
          ticker_earnings_reports: "write failed",
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, syncDeps({
        getCompanyWebsiteSeed: async () => {
          throw new Error("seed lookup failed");
        },
      })),
    ).rejects.toThrow("Failed to upsert earnings report row for AAPL: write failed");

    expect(supabase.tables.ticker_earnings_reports).toHaveLength(0);
  });

  it("surfaces existing-row select failures before mutating any tracked rows", async () => {
    const supabase = createMockSupabase(
      {
        holdings: [{ symbol: "AAPL" }],
        ticker_earnings_reports: [
          {
            symbol: "MSFT",
            is_active: true,
            preferred_url: "https://old.example.com/msft",
            error: null,
          },
        ],
      },
      {
        select: {
          ticker_earnings_reports: "read failed",
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, syncDeps()),
    ).rejects.toThrow("Failed to load existing earnings report rows: read failed");

    expect(supabase.tables.ticker_earnings_reports).toEqual([
      expect.objectContaining({
        symbol: "MSFT",
        is_active: true,
      }),
    ]);
  });

  it("surfaces inactive-row update failures instead of reporting inactivation success", async () => {
    const supabase = createMockSupabase(
      {
        holdings: [{ symbol: "AAPL" }],
        ticker_earnings_reports: [
          oldReport("MSFT"),
        ],
      },
      {
        update: {
          ticker_earnings_reports: "update failed",
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, syncDeps({
        resolveLatestSecEarningsReport: async () => secReport({
          filingForm: "10-Q",
          title: "Quarterly report",
        }),
      })),
    ).rejects.toThrow("Failed to mark inactive earnings report rows: update failed");

    expect(
      supabase.tables.ticker_earnings_reports.find((row) => row.symbol === "MSFT"),
    ).toEqual(expect.objectContaining({ is_active: true }));
  });

  it("upserts idempotently and marks symbols no longer tracked as inactive", async () => {
    const supabase = createMockSupabase({
      holdings: [{ symbol: "AAPL" }],
      ticker_earnings_reports: [
        oldReport("AAPL"),
        oldReport("MSFT"),
      ],
    });

    const deps = {
      getCompanyWebsiteSeed: async (symbol: string) => `https://${symbol.toLowerCase()}.example.com`,
      discoverCompanyEarningsLink: async (websiteUrl: string | null | undefined) => ({
        url: `${websiteUrl}/q1-2026-results`,
        title: "Q1 2026 Results",
      }),
      resolveLatestSecEarningsReport: async () => secReport({
        url: "https://www.sec.gov/Archives/edgar/data/example.htm",
      }),
    };

    const first = await syncTrackedEarningsReports(supabase as never, deps);
    const second = await syncTrackedEarningsReports(supabase as never, deps);

    expect(first.inactivated).toBe(1);
    expect(second.inactivated).toBe(0);
    expect(
      supabase.tables.ticker_earnings_reports.filter((row) => row.symbol === "AAPL"),
    ).toHaveLength(1);
    expect(
      supabase.tables.ticker_earnings_reports.find((row) => row.symbol === "MSFT"),
    ).toEqual(expect.objectContaining({ is_active: false }));
  });
});

describe("earnings report last-known-good (audit J6)", () => {
  const cached = {
    symbol: "AAPL",
    is_active: true,
    preferred_url: "https://investor.example.com/earnings-q3",
    url_source: "company",
    company_url: "https://investor.example.com/earnings-q3",
    sec_url: null,
    report_date: "2026-07-30",
    filing_form: null,
    title: "Q3 results",
    error: null,
  };

  it("keeps a valid cached report when both discovery sources fail, and records the failure", async () => {
    const supabase = createMockSupabase({ holdings: [{ symbol: "AAPL" }], ticker_earnings_reports: [{ ...cached }] });

    const result = await syncTrackedEarningsReports(supabase as never, syncDeps({
      now: () => new Date("2026-10-01T09:17:00.000Z"),
      getCompanyWebsiteSeed: async () => {
        throw new Error("company seed timeout");
      },
      resolveLatestSecEarningsReport: async () => {
        throw new Error("SEC temporarily unavailable");
      },
    }));

    expect(result).toMatchObject({ processed: 1, resolved: 0, missing: 0, failed: 1, stale: 1 });
    const row = supabase.tables.ticker_earnings_reports[0];
    expect(row).toMatchObject({
      preferred_url: "https://investor.example.com/earnings-q3",
      report_date: "2026-07-30",
      title: "Q3 results",
      last_checked_at: "2026-10-01T09:17:00.000Z",
    });
    expect(String(row.error)).toMatch(/Refresh failed; showing the last known report\. SEC temporarily unavailable; company seed timeout/);
  });

  it("replaces the cached report once a newer one is verified", async () => {
    const supabase = createMockSupabase({ holdings: [{ symbol: "AAPL" }], ticker_earnings_reports: [{ ...cached }] });

    const result = await syncTrackedEarningsReports(supabase as never, syncDeps({
      resolveLatestSecEarningsReport: async () => secReport({
        url: "https://www.sec.gov/Archives/edgar/data/320193/q4.htm",
        reportDate: "2026-10-30",
        filingDate: "2026-10-31",
        title: "Q4 results",
        sortDate: "2026-10-30",
        acceptedAt: "20261031160000",
      }),
    }));

    expect(result).toMatchObject({ resolved: 1, failed: 0, stale: 0 });
    expect(supabase.tables.ticker_earnings_reports[0]).toMatchObject({
      preferred_url: "https://www.sec.gov/Archives/edgar/data/320193/q4.htm",
      report_date: "2026-10-30",
      error: null,
    });
  });

  it("a symbol with no cached report and failing sources is recorded as missing with the error", async () => {
    const supabase = createMockSupabase({ holdings: [{ symbol: "MSFT" }] });

    const result = await syncTrackedEarningsReports(supabase as never, syncDeps({
      resolveLatestSecEarningsReport: async () => {
        throw new Error("SEC down");
      },
    }));

    expect(result).toMatchObject({ missing: 1, failed: 1, stale: 0 });
    expect(supabase.tables.ticker_earnings_reports[0]).toMatchObject({ symbol: "MSFT", preferred_url: null, error: "SEC down" });
  });

  it("R8: keeps the cached report of a symbol beyond the first 1,000-row response page", async () => {
    // 1,001 cached rows; only the last one is still tracked, and both providers fail for it.
    const others = Array.from({ length: 1_000 }, (_, index) => ({
      ...cached,
      symbol: `OLD${String(index).padStart(4, "0")}`,
    }));
    const last = { ...cached, symbol: "ZZZZ" };
    const supabase = createMockSupabase({
      holdings: [{ symbol: "ZZZZ" }],
      ticker_earnings_reports: [...others, last],
    });

    mockLimits.maxRows = 1_000;
    try {
      const result = await syncTrackedEarningsReports(supabase as never, syncDeps({
        resolveLatestSecEarningsReport: async () => {
          throw new Error("SEC down");
        },
      }));
      expect(result).toMatchObject({ failed: 1, stale: 1, missing: 0 });
    } finally {
      mockLimits.maxRows = Number.POSITIVE_INFINITY;
    }

    expect(supabase.tables.ticker_earnings_reports.find((row) => row.symbol === "ZZZZ")).toMatchObject({
      is_active: true,
      preferred_url: cached.preferred_url,
      report_date: cached.report_date,
      title: cached.title,
    });
  });
});
