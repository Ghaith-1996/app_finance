import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit J1/J3: unfinished enrichment is durable work; AI failures stay retryable.

const mocked = vi.hoisted(() => ({ analyzeArticle: vi.fn() }));
vi.mock("@/lib/services/ai", () => ({
  getEnrichmentProvider: () => ({ analyzeArticle: mocked.analyzeArticle }),
}));

import {
  countDueEnrichmentBacklog,
  ENRICHMENT_MAX_ATTEMPTS,
  enrichmentBackoffMs,
  ingestNewsToSupabase,
} from "@/lib/services/news/ingest";

type Row = Record<string, unknown> & { id: string };

/** Minimal PostgREST-like fake covering the filters the enrichment service uses. */
function createNewsTable(rows: Row[], hooks: { beforeUpdate?: (id: string) => void } = {}) {
  const query = () => {
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    let mode: "select" | "update" = "select";
    let patch: Record<string, unknown> = {};
    let countOnly = false;

    const apply = () => {
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (mode === "update") {
        const id = matched[0]?.id;
        if (id) hooks.beforeUpdate?.(id);
        const stillMatched = rows.filter((row) => filters.every((filter) => filter(row)));
        for (const row of stillMatched) Object.assign(row, patch);
        return { data: stillMatched.map((row) => ({ id: row.id })), error: null, count: null };
      }
      const sorted = [...matched].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
      const data = sorted.slice(0, limit).map((row) => ({ ...row }));
      return { data: countOnly ? null : data, error: null, count: matched.length };
    };

    const builder = {
      select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) countOnly = true;
        return builder;
      },
      update: (next: Record<string, unknown>) => {
        mode = "update";
        patch = next;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      or: (expression: string) => {
        // Only the form used by the service: "<col>.is.null,<col>.lte.<iso>"
        const [nullPart, ltePart] = expression.split(",");
        const column = nullPart.split(".")[0];
        const iso = ltePart.slice(ltePart.indexOf(".lte.") + 5);
        filters.push((row) => row[column] == null || String(row[column]) <= iso);
        return builder;
      },
      order: () => builder,
      limit: (value: number) => {
        limit = value;
        return builder;
      },
      then: (resolve: (value: ReturnType<typeof apply>) => unknown) => Promise.resolve(apply()).then(resolve),
    };
    return builder;
  };

  return { from: (table: string) => {
    if (table !== "news_items") throw new Error(`Unexpected table ${table}`);
    return query();
  } };
}

function article(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    headline: `Headline ${id}`,
    source: "Wire",
    raw_content: "Original snippet",
    full_content: null,
    stock_tags: [],
    source_type: "gnews",
    category_hint: null,
    published_at: "2026-10-01T12:00:00.000Z",
    global_summary: null,
    enrichment_status: "pending",
    enrichment_attempts: 0,
    enrichment_next_attempt_at: null,
    enrichment_last_error: null,
    enriched_at: null,
    ...overrides,
  };
}

const goodAnalysis = {
  category: "earnings",
  globalSummary: "Apple beat estimates.",
  overallEffect: "bullish",
  stockTags: ["AAPL"],
  tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
};

const T0 = new Date("2026-10-01T12:00:00.000Z");

describe("news enrichment retry semantics", () => {
  beforeEach(() => mocked.analyzeArticle.mockReset());

  it("J3: a transient AI failure stays retryable and later enriches correctly", async () => {
    const rows = [article("news-1")];
    const db = createNewsTable(rows);
    mocked.analyzeArticle.mockRejectedValueOnce(new Error("upstream 503")).mockResolvedValueOnce(goodAnalysis);

    const first = await ingestNewsToSupabase(db as never, { now: T0 });
    expect(first).toEqual({ enriched: 0, skipped: 0, retrying: 1, failed: 0 });
    expect(rows[0]).toMatchObject({
      enrichment_status: "retrying",
      enrichment_attempts: 1,
      global_summary: null,
      enrichment_last_error: "upstream 503",
      enrichment_next_attempt_at: new Date(T0.getTime() + enrichmentBackoffMs(1)).toISOString(),
    });

    // Not due yet: backlog mode respects backoff.
    const early = await ingestNewsToSupabase(db as never, { now: new Date(T0.getTime() + 60_000) });
    expect(early.enriched + early.retrying).toBe(0);

    const later = await ingestNewsToSupabase(db as never, { now: new Date(T0.getTime() + enrichmentBackoffMs(1)) });
    expect(later).toEqual({ enriched: 1, skipped: 0, retrying: 0, failed: 0 });
    expect(rows[0]).toMatchObject({
      enrichment_status: "succeeded",
      global_summary: "Apple beat estimates.",
      stock_tags: ["AAPL"],
      enrichment_last_error: null,
    });
    expect(mocked.analyzeArticle).toHaveBeenCalledTimes(2);

    // Completed work is never repeated.
    const again = await ingestNewsToSupabase(db as never, { now: new Date(T0.getTime() + 10 * 60 * 60_000) });
    expect(again.enriched).toBe(0);
    expect(mocked.analyzeArticle).toHaveBeenCalledTimes(2);
  });

  it("J1: an article inserted before a crash is recovered from the backlog with no new inserts", async () => {
    // Inserted by a previous ingest whose finalize/enrich step never ran.
    const rows = [article("news-1"), article("news-2", { enrichment_status: "succeeded", global_summary: "done" })];
    const db = createNewsTable(rows);
    mocked.analyzeArticle.mockResolvedValue(goodAnalysis);

    expect((await countDueEnrichmentBacklog(db as never, T0)).count).toBe(1);
    const result = await ingestNewsToSupabase(db as never, { now: T0 });

    expect(result.enriched).toBe(1);
    expect(rows[0].enrichment_status).toBe("succeeded");
    expect(mocked.analyzeArticle).toHaveBeenCalledTimes(1);
    expect((await countDueEnrichmentBacklog(db as never, T0)).count).toBe(0);
  });

  it("gives up after the attempt budget with fallback text that is not marked as enriched", async () => {
    const rows = [article("news-1", { enrichment_status: "retrying", enrichment_attempts: ENRICHMENT_MAX_ATTEMPTS - 1 })];
    const db = createNewsTable(rows);
    mocked.analyzeArticle.mockRejectedValueOnce(new Error("still down"));

    const result = await ingestNewsToSupabase(db as never, { now: T0 });

    expect(result.failed).toBe(1);
    expect(rows[0]).toMatchObject({
      enrichment_status: "failed",
      enrichment_attempts: ENRICHMENT_MAX_ATTEMPTS,
      global_summary: "Original snippet",
      overall_effect: "neutral",
    });
    // Review P1: the terminal state is stamped so the analysis cron's work watermark sees the
    // fallback article; the status (not the stamp) is what says it was never enriched.
    expect(typeof rows[0].enriched_at).toBe("string");
    expect((await countDueEnrichmentBacklog(db as never, T0)).count).toBe(0);
  });

  it("explicit article IDs skip work that already succeeded", async () => {
    const rows = [article("news-1", { enrichment_status: "succeeded", global_summary: "done" })];
    const db = createNewsTable(rows);

    const result = await ingestNewsToSupabase(db as never, { articleIds: ["news-1"], now: T0 });

    expect(result.enriched).toBe(0);
    expect(mocked.analyzeArticle).not.toHaveBeenCalled();
  });

  it("a concurrent worker that records the same attempt first wins; the other skips", async () => {
    const rows = [article("news-1")];
    const db = createNewsTable(rows, {
      beforeUpdate: (id) => {
        const row = rows.find((candidate) => candidate.id === id)!;
        if (row.enrichment_attempts === 0) Object.assign(row, { enrichment_attempts: 1, enrichment_status: "succeeded" });
      },
    });
    mocked.analyzeArticle.mockResolvedValue(goodAnalysis);

    const result = await ingestNewsToSupabase(db as never, { now: T0 });

    expect(result).toEqual({ enriched: 0, skipped: 1, retrying: 0, failed: 0 });
  });

  it("overlapping workers claim the row before calling the provider: one call, one outcome", async () => {
    const rows = [article("news-1")];
    const db = createNewsTable(rows);
    // Without a claim both workers call the provider (double traffic), and a timeout in one could
    // commit `retrying` first and discard the other's success.
    mocked.analyzeArticle.mockResolvedValue(goodAnalysis);

    const [backlog, explicit] = await Promise.all([
      ingestNewsToSupabase(db as never, { now: T0 }),
      ingestNewsToSupabase(db as never, { articleIds: ["news-1"], now: T0 }),
    ]);

    expect(mocked.analyzeArticle).toHaveBeenCalledTimes(1);
    expect(backlog.enriched + explicit.enriched).toBe(1);
    expect(backlog.skipped + explicit.skipped).toBe(1);
    expect(rows[0]).toMatchObject({ enrichment_status: "succeeded", enrichment_attempts: 1 });
  });

  it("a claim left by a crashed worker becomes due again after the backoff and counts as an attempt", async () => {
    const rows = [article("news-1")];
    const db = createNewsTable(rows);
    mocked.analyzeArticle.mockImplementationOnce(() => new Promise(() => {})); // never settles

    void ingestNewsToSupabase(db as never, { now: T0 });
    await vi.waitFor(() => expect(mocked.analyzeArticle).toHaveBeenCalledTimes(1));
    expect(rows[0]).toMatchObject({ enrichment_attempts: 1 });

    // Claimed and not yet due: neither backlog nor explicit-ID runs call the provider again.
    const early = await ingestNewsToSupabase(db as never, { articleIds: ["news-1"], now: new Date(T0.getTime() + 60_000) });
    expect(early.enriched + early.retrying + early.failed).toBe(0);
    expect(mocked.analyzeArticle).toHaveBeenCalledTimes(1);

    mocked.analyzeArticle.mockResolvedValueOnce(goodAnalysis);
    const later = await ingestNewsToSupabase(db as never, { now: new Date(T0.getTime() + enrichmentBackoffMs(1)) });
    expect(later.enriched).toBe(1);
    expect(rows[0]).toMatchObject({ enrichment_status: "succeeded", enrichment_attempts: 2 });
  });

  it("backoff grows and is capped", () => {
    expect(enrichmentBackoffMs(1)).toBe(5 * 60_000);
    expect(enrichmentBackoffMs(2)).toBe(10 * 60_000);
    expect(enrichmentBackoffMs(20)).toBe(6 * 60 * 60_000);
  });
});
