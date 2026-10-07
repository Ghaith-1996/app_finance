import { describe, expect, it } from "vitest";

import { loadJobHealth } from "@/lib/services/job-health";

// Audit H8: health reflects durable job state, not cron HTTP codes.

type Answer = { data?: unknown; count?: number; error?: { message: string } | null };

/**
 * Returns a canned answer per table + filter signature; list answers honour .range() pages.
 * An RPC is answered as the table "rpc:<name>". `tables` records every table/RPC read.
 */
function fakeSupabase(answers: (table: string, ops: string[]) => Answer, tables: Array<[string, string[]]> = []) {
  return {
    rpc(name: string) {
      return this.from(`rpc:${name}`);
    },
    from(table: string) {
      const ops: string[] = [];
      tables.push([table, ops]);
      let window: [number, number] | null = null;
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "in", "or", "eq", "gte", "not"]) {
        builder[method] = (...args: unknown[]) => {
          ops.push(`${method}:${JSON.stringify(args)}`);
          return builder;
        };
      }
      builder.range = (from: number, to: number) => {
        window = [from, to];
        return builder;
      };
      const answer = () => {
        const result = { error: null, ...answers(table, ops) };
        if (window && Array.isArray(result.data)) result.data = result.data.slice(window[0], window[1] + 1);
        return result;
      };
      builder.maybeSingle = async () => answer();
      builder.then = (resolve: (value: Answer) => unknown) => Promise.resolve(answer()).then(resolve);
      return builder;
    },
  };
}

const NOW = new Date("2026-10-02T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function healthyAnswers(table: string, ops: string[]): Answer {
  const has = (text: string) => ops.some((op) => op.includes(text));
  if (table === "news_items" && has("order:[\"created_at\"") && !has("enrichment_status")) {
    return { data: { created_at: minutesAgo(10) } };
  }
  if (table === "news_items" && has("enriched_at")) return { data: { enriched_at: minutesAgo(15) } };
  if (table === "portfolios") return { data: [{ id: "p1", created_at: minutesAgo(30 * 24 * 60) }] };
  if (table === "rpc:latest_usable_analysis_runs") {
    return { data: [{ id: "r1", portfolio_id: "p1", started_at: minutesAgo(32), completed_at: minutesAgo(30) }] };
  }
  if (table === "holdings" && !has("or:")) return { count: 10 };
  return { data: null, count: 0 };
}

/** Healthy answers with these portfolios and usable runs. */
function withAnalysis(
  portfolios: Array<{ id: string; created_at: string }>,
  runs: Array<{ id: string; portfolio_id: string; started_at: string; completed_at: string }>,
  newestEnrichedAt = minutesAgo(15),
) {
  return (table: string, ops: string[]): Answer => {
    const has = (text: string) => ops.some((op) => op.includes(text));
    if (table === "portfolios") return { data: portfolios };
    if (table === "rpc:latest_usable_analysis_runs") return { data: runs };
    if (table === "news_items" && has("enriched_at")) return { data: { enriched_at: newestEnrichedAt } };
    return healthyAnswers(table, ops);
  };
}

describe("loadJobHealth", () => {
  it("reports ok when work is flowing", async () => {
    const report = await loadJobHealth(fakeSupabase(healthyAnswers) as never, NOW);
    expect(report.status).toBe("ok");
    expect(report.reasons).toEqual([]);
    expect(report.ingestion.minutesSinceLatest).toBe(10);
  });

  it("flags a stalled schedule, a stuck backlog, failed runs and uncertain deliveries", async () => {
    const report = await loadJobHealth(
      fakeSupabase((table, ops) => {
        const has = (text: string) => ops.some((op) => op.includes(text));
        if (table === "news_items" && has("order:[\"created_at\"") && has("enrichment_status")) {
          return { data: { created_at: minutesAgo(300) } };
        }
        if (table === "news_items" && has("order:[\"created_at\"")) return { data: { created_at: minutesAgo(240) } };
        if (table === "analysis_runs" && has("eq:[\"status\"")) return { count: 2 };
        if (table === "notification_deliveries" && ops.some((op) => op.includes("uncertain"))) return { count: 1 };
        return healthyAnswers(table, ops);
      }) as never,
      NOW,
    );

    expect(report.status).toBe("degraded");
    const reasons = report.reasons.join(" | ");
    expect(reasons).toMatch(/ingestion schedule may not be running/);
    expect(reasons).toMatch(/backlog is not draining/);
    expect(reasons).toMatch(/2 analysis run\(s\) failed/);
    expect(reasons).toMatch(/1 uncertain/);
  });

  it("R12: terminal enrichment failures and failing earnings refreshes degrade health", async () => {
    let earningsOps: string[] = [];
    const report = await loadJobHealth(
      fakeSupabase((table, ops) => {
        const has = (text: string) => ops.some((op) => op.includes(text));
        if (table === "news_items" && has('eq:["enrichment_status","failed"]')) return { count: 500 };
        if (table === "ticker_earnings_reports") {
          earningsOps = ops;
          return { count: 20 };
        }
        return healthyAnswers(table, ops);
      }) as never,
      NOW,
    );

    expect(report.status).toBe("degraded");
    expect(report.enrichment.failedLast24h).toBe(500);
    const reasons = report.reasons.join(" | ");
    expect(reasons).toMatch(/500 article\(s\) from the last 24 hours failed enrichment/);
    expect(reasons).toMatch(/20 tracked symbol\(s\) failed their last earnings report refresh/);
    // Informational notes ("no newer report", "no link found") are not counted as failures.
    expect(earningsOps.join(" ")).toMatch(/not:\["error","in",.*No newer report found.*No earnings report link found/);
  });

  it("R12: a few failures stay within the thresholds", async () => {
    const report = await loadJobHealth(
      fakeSupabase((table, ops) => {
        const has = (text: string) => ops.some((op) => op.includes(text));
        if (table === "news_items" && has('eq:["enrichment_status","failed"]')) return { count: 3 };
        if (table === "ticker_earnings_reports") return { count: 2 };
        return healthyAnswers(table, ops);
      }) as never,
      NOW,
    );
    expect(report.status).toBe("ok");
  });

  describe("analysis freshness is evaluated per portfolio (PR review)", () => {
    const old = minutesAgo(30 * 24 * 60);
    const recentRun = (portfolioId: string) => ({
      id: `run-${portfolioId}`,
      portfolio_id: portfolioId,
      started_at: minutesAgo(32),
      completed_at: minutesAgo(30),
    });
    const staleRun = (portfolioId: string) => ({
      id: `run-${portfolioId}`,
      portfolio_id: portfolioId,
      started_at: minutesAgo(10 * 60),
      completed_at: minutesAgo(9 * 60 + 50),
    });

    it("one recently analysed portfolio does not hide others that fell behind or never ran", async () => {
      const report = await loadJobHealth(
        fakeSupabase(
          withAnalysis(
            [
              { id: "fresh", created_at: old },
              { id: "behind", created_at: old },
              { id: "never", created_at: old },
            ],
            [recentRun("fresh"), staleRun("behind")],
          ),
        ) as never,
        NOW,
      );

      expect(report.status).toBe("degraded");
      expect(report.analysis).toMatchObject({ portfolios: 3, portfoliosBehind: 1, portfoliosNeverAnalyzed: 1 });
      expect(report.analysis.latestUsableRunAt).toBe(minutesAgo(30));
      const reasons = report.reasons.join(" | ");
      expect(reasons).toMatch(/1 of 3 portfolio\(s\) have unanalysed news/);
      expect(reasons).toMatch(/1 of 3 portfolio\(s\) have never completed an analysis run/);
    });

    it("uses each portfolio's newest usable run, wherever it appears in the list", async () => {
      const report = await loadJobHealth(
        fakeSupabase(
          withAnalysis(
            [{ id: "p1", created_at: old }],
            [recentRun("p1"), { ...staleRun("p1"), id: "run-p1-older" }],
          ),
        ) as never,
        NOW,
      );
      expect(report.analysis.portfoliosBehind).toBe(0);
      expect(report.status).toBe("ok");
    });

    it("an old run is not behind when nothing was enriched since it started (quiet period)", async () => {
      const report = await loadJobHealth(
        fakeSupabase(withAnalysis([{ id: "p1", created_at: old }], [staleRun("p1")], minutesAgo(11 * 60))) as never,
        NOW,
      );
      expect(report.analysis.portfoliosBehind).toBe(0);
    });

    it("a portfolio created within the threshold is not yet counted as never analysed", async () => {
      const report = await loadJobHealth(
        fakeSupabase(withAnalysis([{ id: "p1", created_at: old }, { id: "new", created_at: minutesAgo(20) }], [recentRun("p1")])) as never,
        NOW,
      );
      expect(report.analysis.portfoliosNeverAnalyzed).toBe(0);
      expect(report.status).toBe("ok");
    });

    it("reads the latest run per portfolio, never the run history", async () => {
      const tables: Array<[string, string[]]> = [];
      await loadJobHealth(fakeSupabase(healthyAnswers, tables) as never, NOW);
      expect(tables.map(([table]) => table)).toContain("rpc:latest_usable_analysis_runs");
      const historyScans = tables.filter(
        ([table, ops]) => table === "analysis_runs" && ops.some((op) => op.includes("portfolio_id")),
      );
      expect(historyScans).toEqual([]);
    });

    it("reads every page of portfolios and runs", async () => {
      const portfolios = Array.from({ length: 2_500 }, (_, index) => ({ id: `p${index}`, created_at: old }));
      const runs = portfolios.slice(0, 2_499).map((portfolio) => recentRun(portfolio.id));
      const report = await loadJobHealth(fakeSupabase(withAnalysis(portfolios, runs)) as never, NOW);
      expect(report.analysis).toMatchObject({ portfolios: 2_500, portfoliosNeverAnalyzed: 1, portfoliosBehind: 0 });
    });
  });

  it("treats a failed health query as degraded, never as healthy", async () => {
    const report = await loadJobHealth(
      fakeSupabase((table, ops) => (table === "holdings" ? { error: { message: "timeout" } } : healthyAnswers(table, ops))) as never,
      NOW,
    );
    expect(report.status).toBe("degraded");
    expect(report.reasons.join(" ")).toMatch(/Health query failed: timeout/);
  });
});
