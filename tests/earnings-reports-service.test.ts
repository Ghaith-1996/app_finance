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

function createQueryBuilder(
  rows: Array<Record<string, unknown>>,
  columns: string,
  errorMessage?: string,
) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];

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
    then<TResult1 = { data: Array<Record<string, unknown>>; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      if (errorMessage) {
        return Promise.resolve({
          data: null,
          error: { message: errorMessage },
        }).then(onfulfilled, onrejected);
      }

      const data = rows
        .filter((row) => filters.every((filter) => filter(row)))
        .map((row) => pickColumns(row, columns));

      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function createUpdateBuilder(
  rows: Array<Record<string, unknown>>,
  patch: Record<string, unknown>,
  errorMessage?: string,
) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];

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
    then<TResult1 = { data: null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      if (errorMessage) {
        return Promise.resolve({
          data: null,
          error: { message: errorMessage },
        }).then(onfulfilled, onrejected);
      }

      for (const row of rows) {
        if (filters.every((filter) => filter(row))) {
          Object.assign(row, patch);
        }
      }

      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
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
          return createUpdateBuilder(
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
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://investor.example.com/") {
        return htmlResponse(`
          <html>
            <body>
              <a href="/investor-relations">Investor Relations</a>
            </body>
          </html>
        `);
      }

      if (url === "https://investor.example.com/investor-relations") {
        return htmlResponse(`
          <html>
            <body>
              <a href="/press/q1-2026-results.html">Q1 2026 Results</a>
            </body>
          </html>
        `);
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

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
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await discoverCompanyEarningsLink("http://127.0.0.1/internal", {
      fetchImpl,
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks redirect targets that resolve to private or metadata URLs", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://investor.example.com/") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await discoverCompanyEarningsLink("https://investor.example.com/", {
      fetchImpl,
      lookupImpl: async () => [{ address: "93.184.216.34" }],
    });

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("allows redirect chains when every hop stays on a validated public target", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://investor.example.com/") {
        return new Response(null, {
          status: 302,
          headers: { location: "/investor-relations" },
        });
      }

      if (url === "https://investor.example.com/investor-relations") {
        return htmlResponse(`
          <html>
            <body>
              <a href="/press/q2-2026-results.html">Q2 2026 Results</a>
            </body>
          </html>
        `);
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

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
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://www.sec.gov/files/company_tickers.json") {
        return jsonResponse({
          "0": { ticker: "MSFT", cik_str: 789019 },
        });
      }

      if (url === "https://data.sec.gov/submissions/CIK0000789019.json") {
        return jsonResponse({
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
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await resolveLatestSecEarningsReport("MSFT", { fetchImpl });
    expect(result).toBeNull();
  });

  it("does not let a newer unrelated 8-K beat an older real earnings filing", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://www.sec.gov/files/company_tickers.json") {
        return jsonResponse({
          "0": { ticker: "NVDA", cik_str: 1045810 },
        });
      }

      if (url === "https://data.sec.gov/submissions/CIK0001045810.json") {
        return jsonResponse({
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
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

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

    const result = await syncTrackedEarningsReports(supabase as never, {
      getCompanyWebsiteSeed: async () => "https://apple.example.com",
      discoverCompanyEarningsLink: async () => null,
      resolveLatestSecEarningsReport: async () => ({
        url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
        reportDate: "2026-04-30",
        filingDate: "2026-05-01",
        filingForm: "8-K",
        title: "Current report",
        sortDate: "2026-04-30",
        score: 100,
        acceptedAt: "20260501160000",
      }),
    });

    expect(result).toEqual({
      processed: 1,
      resolved: 1,
      companyLinks: 0,
      secFallbacks: 1,
      missing: 0,
      inactivated: 0,
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

    const result = await syncTrackedEarningsReports(supabase as never, {
      getCompanyWebsiteSeed: async () => null,
      discoverCompanyEarningsLink: async () => null,
      resolveLatestSecEarningsReport: async () => null,
    });

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
      syncTrackedEarningsReports(supabase as never, {
        resolveLatestSecEarningsReport: async () => null,
        discoverCompanyEarningsLink: async () => null,
        getCompanyWebsiteSeed: async () => null,
      }),
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
      syncTrackedEarningsReports(supabase as never, {
        getCompanyWebsiteSeed: async () => null,
        discoverCompanyEarningsLink: async () => null,
        resolveLatestSecEarningsReport: async () => ({
          url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
          reportDate: "2026-04-30",
          filingDate: "2026-05-01",
          filingForm: "10-Q",
          title: "Quarterly report",
          sortDate: "2026-04-30",
          score: 100,
          acceptedAt: "20260501160000",
        }),
      }),
    ).rejects.toThrow("Failed to upsert earnings report row for AAPL: write failed");

    expect(supabase.tables.ticker_earnings_reports).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        preferred_url: null,
        url_source: null,
        error: "Failed to upsert earnings report row for AAPL: write failed",
      }),
    ]);
  });

  it("surfaces error-row upsert failures when fallback persistence also fails", async () => {
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
      syncTrackedEarningsReports(supabase as never, {
        getCompanyWebsiteSeed: async () => {
          throw new Error("seed lookup failed");
        },
        discoverCompanyEarningsLink: async () => null,
        resolveLatestSecEarningsReport: async () => null,
      }),
    ).rejects.toThrow("Failed to upsert earnings report error row for AAPL: write failed");

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
      syncTrackedEarningsReports(supabase as never, {
        getCompanyWebsiteSeed: async () => null,
        discoverCompanyEarningsLink: async () => null,
        resolveLatestSecEarningsReport: async () => null,
      }),
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
          {
            symbol: "MSFT",
            preferred_url: "https://old.example.com/msft",
            url_source: "company",
            company_url: "https://old.example.com/msft",
            sec_url: null,
            report_date: "2025-01-01",
            filing_form: null,
            title: "Old link",
            is_active: true,
            last_checked_at: "2025-01-01T00:00:00.000Z",
            error: null,
          },
        ],
      },
      {
        update: {
          ticker_earnings_reports: "update failed",
        },
      },
    );

    await expect(
      syncTrackedEarningsReports(supabase as never, {
        getCompanyWebsiteSeed: async () => null,
        discoverCompanyEarningsLink: async () => null,
        resolveLatestSecEarningsReport: async () => ({
          url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
          reportDate: "2026-04-30",
          filingDate: "2026-05-01",
          filingForm: "10-Q",
          title: "Quarterly report",
          sortDate: "2026-04-30",
          score: 100,
          acceptedAt: "20260501160000",
        }),
      }),
    ).rejects.toThrow("Failed to mark inactive earnings report rows: update failed");

    expect(
      supabase.tables.ticker_earnings_reports.find((row) => row.symbol === "MSFT"),
    ).toEqual(expect.objectContaining({ is_active: true }));
  });

  it("upserts idempotently and marks symbols no longer tracked as inactive", async () => {
    const supabase = createMockSupabase({
      holdings: [{ symbol: "AAPL" }],
      ticker_earnings_reports: [
        {
          symbol: "AAPL",
          preferred_url: "https://old.example.com/aapl",
          url_source: "company",
          company_url: "https://old.example.com/aapl",
          sec_url: null,
          report_date: "2025-01-01",
          filing_form: null,
          title: "Old link",
          is_active: true,
          last_checked_at: "2025-01-01T00:00:00.000Z",
          error: null,
        },
        {
          symbol: "MSFT",
          preferred_url: "https://old.example.com/msft",
          url_source: "company",
          company_url: "https://old.example.com/msft",
          sec_url: null,
          report_date: "2025-01-01",
          filing_form: null,
          title: "Old link",
          is_active: true,
          last_checked_at: "2025-01-01T00:00:00.000Z",
          error: null,
        },
      ],
    });

    const deps = {
      getCompanyWebsiteSeed: async (symbol: string) => `https://${symbol.toLowerCase()}.example.com`,
      discoverCompanyEarningsLink: async (websiteUrl: string | null | undefined) => ({
        url: `${websiteUrl}/q1-2026-results`,
        title: "Q1 2026 Results",
      }),
      resolveLatestSecEarningsReport: async () => ({
        url: "https://www.sec.gov/Archives/edgar/data/example.htm",
        reportDate: "2026-04-30",
        filingDate: "2026-05-01",
        filingForm: "8-K",
        title: "Current report",
        sortDate: "2026-04-30",
        score: 100,
        acceptedAt: "20260501160000",
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
