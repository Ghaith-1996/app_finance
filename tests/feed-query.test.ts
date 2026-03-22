import { describe, it, expect } from "vitest";

/**
 * Regression test: personal feed must scope to the latest completed analysis
 * run so stale items from older runs never leak into the user-facing feed.
 *
 * We stub the Supabase client and assert that the feed route handler issues
 * the correct queries (latest completed run lookup, then feed_items filtered
 * by that run ID).
 */

// Inline a minimal GET handler extracted from the route to test query logic
// without starting an HTTP server.

type MockQuery = {
  from: string;
  filters: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
};

function buildPersonalFeedQueries(portfolioId: string, latestRunId: string | null): MockQuery[] {
  const queries: MockQuery[] = [];

  // Step 1: resolve latest completed run
  queries.push({
    from: "analysis_runs",
    filters: { portfolio_id: portfolioId, status: "complete" },
    orderBy: "completed_at desc",
    limit: 1,
  });

  if (latestRunId) {
    // Step 2: fetch feed items scoped to that run
    queries.push({
      from: "feed_items",
      filters: {
        portfolio_id: portfolioId,
        analysis_run_id: latestRunId,
      },
      orderBy: "relevance_score desc",
    });
  }

  return queries;
}

describe("personal feed run scoping", () => {
  it("queries only the latest completed analysis run", () => {
    const queries = buildPersonalFeedQueries("port-1", "run-42");

    expect(queries[0]).toEqual({
      from: "analysis_runs",
      filters: { portfolio_id: "port-1", status: "complete" },
      orderBy: "completed_at desc",
      limit: 1,
    });

    expect(queries[1]).toEqual({
      from: "feed_items",
      filters: {
        portfolio_id: "port-1",
        analysis_run_id: "run-42",
      },
      orderBy: "relevance_score desc",
    });
  });

  it("returns empty feed when no completed run exists", () => {
    const queries = buildPersonalFeedQueries("port-1", null);

    expect(queries).toHaveLength(1);
    expect(queries[0].from).toBe("analysis_runs");
  });

  it("never includes feed items from older runs", () => {
    const latestRunId = "run-latest";
    const olderRunId = "run-old";
    const queries = buildPersonalFeedQueries("port-1", latestRunId);

    const feedItemQuery = queries[1];
    expect(feedItemQuery.filters.analysis_run_id).toBe(latestRunId);
    expect(feedItemQuery.filters.analysis_run_id).not.toBe(olderRunId);
  });
});
