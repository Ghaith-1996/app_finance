import { describe, expect, it } from "vitest";

import { loadJobHealth } from "@/lib/services/job-health";

// Audit H8: health reflects durable job state, not cron HTTP codes.

type Answer = { data?: unknown; count?: number; error?: { message: string } | null };

/** Returns a canned answer per table + filter signature. */
function fakeSupabase(answers: (table: string, ops: string[]) => Answer) {
  return {
    from(table: string) {
      const ops: string[] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "in", "or", "eq", "gte", "not"]) {
        builder[method] = (...args: unknown[]) => {
          ops.push(`${method}:${JSON.stringify(args)}`);
          return builder;
        };
      }
      builder.maybeSingle = async () => ({ error: null, ...answers(table, ops) });
      builder.then = (resolve: (value: Answer) => unknown) =>
        Promise.resolve({ error: null, ...answers(table, ops) }).then(resolve);
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
  if (table === "analysis_runs" && has("completed_at")) return { data: { completed_at: minutesAgo(30) } };
  if (table === "holdings" && !has("or:")) return { count: 10 };
  return { data: null, count: 0 };
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

  it("treats a failed health query as degraded, never as healthy", async () => {
    const report = await loadJobHealth(
      fakeSupabase((table, ops) => (table === "holdings" ? { error: { message: "timeout" } } : healthyAnswers(table, ops))) as never,
      NOW,
    );
    expect(report.status).toBe("degraded");
    expect(report.reasons.join(" ")).toMatch(/Health query failed: timeout/);
  });
});
